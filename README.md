# Chess

A browser chess game built with Vite, React, and TypeScript. It supports both local pass-and-play and a Stockfish-backed AI opponent without replacing the in-app rules engine.

## Features

- Complete chess rules engine written from scratch in TypeScript
  - Legal move generation for all pieces
  - Castling (kingside & queenside)
  - En passant
  - Pawn promotion with piece picker
  - Check, checkmate, and stalemate detection
  - Claimable draws by threefold repetition and the fifty-move rule
  - Automatic draws by fivefold repetition and the seventy-five-move rule
  - Insufficient material draw
- Click-to-move and drag-and-drop piece movement
- Visual indicators: selected piece, legal move dots/rings, last move highlight, check glow on king
- Move history in algebraic notation with auto-scroll to latest move
- Captured pieces display with material advantage count per player
- Undo last move
- Human vs AI mode with a lazily loaded Stockfish Web Worker
  - Play as White or Black
  - Easy / Medium / Hard difficulty via engine thinking time
  - AI thinking indicator and input lockout while the engine searches
- Dark UI that fits a single viewport on desktop

## Tech Stack

- [Vite](https://vite.dev/) — build tool and dev server
- [React 19](https://react.dev/) — UI
- [TypeScript](https://www.typescriptlang.org/) — end-to-end type safety
- [Vitest](https://vitest.dev/) — engine unit tests
- [Stockfish.js](https://github.com/nmrugg/stockfish.js) — WebAssembly Stockfish build used inside a Web Worker
- Pure CSS — no UI frameworks or component libraries

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Stockfish is loaded only when `Human vs AI` mode is enabled. The engine runs in a dedicated Web Worker, communicates over UCI, and returns moves that are still validated and applied by the existing `ChessGame` rules engine.

## Scripts

| Command           | Description                               |
| ----------------- | ----------------------------------------- |
| `npm run dev`     | Start dev server at `localhost:3000`      |
| `npm run build`   | Type-check and produce a production build |
| `npm run preview` | Serve the production build locally        |
| `npm test`        | Run engine unit tests                     |

## Project Structure

```
src/
  engine/
    types.ts        # Shared types: Piece, Move, ChessState, GameStatus, etc.
    board.ts        # Board helpers, piece symbols, coordinate utilities
    ChessGame.ts    # Full rules engine + ChessGame class
  ai/
    config.ts             # AI mode + difficulty settings
    stockfishWorker.ts    # Worker factory for the Stockfish WASM build
    stockfishManager.ts   # UCI manager for worker lifecycle and bestmove parsing
    uci.ts                # UCI parsing helpers
  components/
    ChessBoard.tsx  # Board renderer — squares, pieces, highlights, drag/drop
    MoveList.tsx    # Move history panel with auto-scroll
  styles/
    index.css       # All styles via CSS custom properties, no frameworks
  App.tsx           # Game state, event handlers, layout, sub-components
  main.tsx          # React entry point
tests/
  chess.test.ts     # Engine unit tests
```

## How Move Legality Works

The UI never moves pieces directly. It always asks the engine for the set of legal moves.

1. The engine generates pseudo-legal moves for the side to move.
2. Each candidate move is simulated on a cloned board.
3. Any move that leaves that side's king in check is discarded.
4. Only the remaining moves are exposed to the UI — illegal moves cannot be played.

Castling, en passant, promotion, draw claims, automatic draw thresholds, and insufficient material are all enforced in the engine layer.

## AI Integration Notes

- The app does not duplicate move rules for the AI. Stockfish only suggests a UCI move.
- The current position is converted to FEN using `ChessGame.toFen()`.
- The position is sent to Stockfish with `position fen ...`.
- The engine searches with `go movetime ...`.
- The chosen move is converted back into board coordinates and applied through `game.move(...)`, so castling, en passant, promotion, checkmate, stalemate, and draw logic stay inside the existing rules engine.

## License

MIT
