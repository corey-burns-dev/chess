Looks like you already have a `fix.md` in `.plans/` — but it refers to `stockfishWorker.ts`, `StockfishManager`, and `aiReady` state that I don't see in the actual source files. My guess is those have already been cleaned up since that plan was written. Let me give you the current-state review based on what's actually in the code.

---

## Chess App — Code Review

This is genuinely solid work. The custom chess engine is the highlight — clean architecture, correct rule implementation, proper FEN generation, SAN building, and thorough draw detection. The backend SignalR hub has excellent ghost-player handling with the dual queue/set design. Here's what needs attention:

---

### 🔴 Critical

**1. `@microsoft/signalr ^10.0.0` doesn't exist**
The latest stable SignalR JS client is `8.x`. This version constraint will cause `bun install` to fail and break the entire project. Change to `^8.0.0`.

**2. No Vite dev proxy for `/api` and `/gamehub`**
In dev, the frontend runs on `localhost:5173` (or 3000) and the backend on `localhost:5000`. Without a proxy, the browser blocks cross-origin requests even though `appsettings.Development.json` allows the origin. Add to `vite.config.ts`:
```ts
server: {
  proxy: {
    '/api': 'http://localhost:5000',
    '/gamehub': { target: 'ws://localhost:5000', ws: true },
  }
}
```
Without this, AI mode and multiplayer both silently fail in local dev.

**3. `StockfishService` spawns a new process per AI request**
The current `GetBestMoveAsync` creates a new `Process` object each call, runs `uci`/`isready` handshake, gets the move, then exits. Stockfish takes ~200–500ms just to initialize — this doubles every AI move's latency. The service is already registered as a `Singleton`, but the persistent process pattern isn't being used. The `EnsureProcessRunning()` method is there but the `_process` field starts null and gets rebuilt each call because nothing holds it alive. Fix: initialize once in the constructor and keep `_writer`/`_reader` alive across calls. You already have `_semaphore` for serialization — the skeleton is right, just wire it up.

---

### 🟡 Significant

**4. `RecoverSession` trusts client-supplied game ID and color with no auth**
```csharp
public async Task RecoverSession(string gameId, string colorStr)
{
    if (!_activeGames.TryGetValue(gameId, out var session))
    {
        session = new GameSession { GameId = gameId }; // ← creates game from scratch
        _activeGames[gameId] = session;
    }
    if (colorStr == "white") session.WhitePlayerId = playerId;
```
Any client can call `RecoverSession("some-existing-game-id", "white")` and hijack the white seat of a live game. At minimum, only allow recovery if the game exists AND the seat is empty (reconnecting after disconnect). If the seat is already occupied by a different connection, reject it.

**5. `SendMove` doesn't lock the game session against concurrent moves**
`ConcurrentDictionary` protects dictionary reads/writes but not the `GameSession` object itself. Two players can theoretically fire `SendMove` simultaneously on the same game, both pass the `WhoseTurn` check on the same state, and both moves get applied. In practice this is rare but in load testing it will happen. Add a `SemaphoreSlim` per session or use `lock(session)`.

**6. `handleReset` called inside SignalR `GameStarted` handler (stale closure)**
```tsx
connection.on("GameStarted", (gameId, assignedColor) => {
  // ...
  gameRef.current.reset();          // fine — ref
  setGameSession((s) => s + 1);     // fine — updater fn
  handleReset();                    // ← captures stale closure from effect setup
});
```
`handleReset` is not in the `useEffect` dependency array and is recreated on every render. The version captured at connection setup time may hold a stale `aiRequestTokenRef` or game state. Inline the reset logic directly, or extract it to a `useCallback` with the correct deps and include it in the effect's dep array.

**7. Backend/frontend engines can silently diverge**
The backend validates moves with `ChessDotNet` while the frontend uses your custom `ChessGame.ts`. If there's any edge case where they disagree — en passant timing, castling rights after rook capture on its own square, promotion handling — the backend will reject a valid move or the frontend will accept one the backend won't. This is a real risk for a chess app. The safest fix is adding a few shared edge-case positions to your backend tests that specifically test the scenarios your frontend engine handles.

**8. Board not locked during SignalR reconnect**
```tsx
const boardLocked = Boolean(
  // ...
  (isMultiplayerMode && (!multiplayerId || isOpponentTurn)) || // ← missing connection state check
```
`withAutomaticReconnect()` means the connection can be in a `Reconnecting` state. During that window `boardLocked` is `false` if it's your turn, and `SendMove` fires on a dead connection. Add:
```tsx
hubConnectionRef.current?.state !== signalR.HubConnectionState.Connected
```
to the `boardLocked` condition (you actually already have this — I see it in the App.tsx — so this is fine, ignore this one).

---

### 🟠 Logic / Architecture

**9. Duplicate algebraic-to-index parsing in `ReceiveMove`**
```tsx
connection.on("ReceiveMove", (moveStr) => {
  const from = moveStr.slice(0, 2);
  const to = moveStr.slice(2, 4);
  const fromIdx = algebraicToIndex(from);   // ← good, uses the engine fn
  const toIdx = algebraicToIndex(to);
```
Actually you're using `algebraicToIndex` here correctly. But worth noting that `parseBestMove` in `uci.ts` duplicates part of this same logic. If you ever have a third callsite, extract a shared `parseMoveString(moveStr)` util.

**10. `hasInsufficientMaterial` — KB vs KB same-color logic**
```ts
if (bishopCount === 2) {
  const [first, second] = allMinors;
  return isLightSquare(first.square) === isLightSquare(second.square);
}
```
This is correct for KBvKB (same color square = draw). However it doesn't handle KBB vs K (two bishops on the same side), which is *not* insufficient material. The early check `totalMinorCount === 2` gates this correctly, so it's fine — but the case `whiteMinors.length === 2` with two same-color bishops would be missed. Add a test for KBB vs K.

**11. `GameHub` static state — server restart drops all games silently**
The static dictionaries mean a server restart disconnects clients with no `OpponentDisconnected` event. The frontend will just hang. This is expected for a v1, but worth noting that the `OnDisconnectedAsync` cleanup path is your only safety net here and it works correctly.

**12. `toFen` comment is missing**
The coordinate system (`index 0 = a8`, `index 63 = h1`) is non-obvious and correctly noted in `board.ts`, but `toFen`'s rank loop iterates `0..7` which maps to ranks `8..1` by coincidence of the layout. Add a short comment explaining that `rank=0` here corresponds to FEN's first row (the 8th rank) to prevent future confusion.

---

### 🟢 Minor / Polish

**13. `AI_MOVE_DELAY_MS` adds artificial latency on top of real latency**
Once the Stockfish process is persistent, the AI will respond in true `movetimeMs`. The extra `sleep(AI_MOVE_DELAY_MS)` then makes it feel slower than it is. Fine for UX polish on Easy mode, but consider making the delay adaptive (e.g., only add delay if the response came back faster than 500ms).

**14. `parseBestMove` in `uci.ts` is unused**
`parseBestMove` is exported but never imported anywhere — the backend extracts the move string from JSON and the frontend never reads raw UCI output. Either remove it or document it as a utility for potential future use.

**15. `GameHub` test coverage is thin**
`FindGame_SecondPlayer_StartsGame` only asserts `GameStarted` was sent at least twice but doesn't verify the correct game ID or color assignment. A richer assertion — verifying white gets `"white"` and black gets `"black"` — would catch a color-swap regression. Also no test for `OnDisconnectedAsync` cleanup or the `RecoverSession` auth bypass described above.

**16. `bin/` and `obj/` directories are committed**
Both `backend/bin/` and `backend/obj/` are in the zip (and likely in the repo). These should be in `.gitignore`. Your `.gitignore` probably already lists them but they were committed before it was added — run `git rm -r --cached backend/bin backend/obj` to clean them out.

---

### Priority Fix List

1. Fix `@microsoft/signalr` to `^8.0.0` — unblocks the whole project
2. Add Vite proxy for `/api` and `/gamehub` — unblocks local dev
3. Fix `StockfishService` to hold a persistent process — fixes AI move speed
4. Harden `RecoverSession` against seat hijacking — critical multiplayer bug
5. Add per-session lock in `SendMove` — race condition under load
6. Remove `bin/` and `obj/` from git tracking

The chess engine itself is excellent — proper castling, en passant, promotion as four distinct moves, correct draw detection including the FIDE 75-move/fivefold rules, and a solid position-key for repetition. That's the hardest part and it's well done.
