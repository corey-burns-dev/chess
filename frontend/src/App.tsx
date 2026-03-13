import { useEffect, useMemo, useRef, useState } from "react";
import * as signalR from "@microsoft/signalr";
import { AI_DIFFICULTY_SETTINGS, AI_MOVE_DELAY_MS } from "./ai/config";
import { parseUciMove } from "./ai/uci";
import { ChessBoard } from "./components/ChessBoard";
import { MoveList } from "./components/MoveList";
import { ChessGame, indexToAlgebraic } from "./engine/ChessGame";
import type { GameMode, AIDifficulty } from "./ai/config";
import type { StockfishManager } from "./ai/stockfishManager";
import type {
  ChessState,
  Color,
  GameResult,
  GameStatus,
  Move,
  Piece,
  PieceType,
} from "./engine/types";
import { PIECE_SYMBOLS, oppositeColor } from "./engine/board";

// ─── Types ──────────────────────────────────────────────────────────────────

type ExtendedGameMode = GameMode | "multiplayer";

interface PromotionRequest {
  from: number;
  to: number;
  options: Move[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const PROMOTION_ORDER: PieceType[] = ["q", "r", "b", "n"];
const MOVE_SOUND_SRC = "/sounds/chess-move.mp3";
const BACKEND_URL = "http://localhost:5000";

const PIECE_VALUES: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const PIECE_NAMES: Record<PieceType, string> = {
  q: "Queen",
  r: "Rook",
  b: "Bishop",
  n: "Knight",
  p: "Pawn",
  k: "King",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function colorName(color: Color): string {
  return color === "w" ? "White" : "Black";
}

function materialScore(pieces: Piece[]): number {
  return pieces.reduce((sum, p) => sum + PIECE_VALUES[p.type], 0);
}

function resultIcon(result: GameResult): string {
  if (result.winner === "w") return "♔";
  if (result.winner === "b") return "♚";
  return "½";
}

function resultHeadline(result: GameResult): string {
  if (result.winner) return `${colorName(result.winner)} wins`;
  return "Draw";
}

function formatReason(reason: string): string {
  return reason.replace(/-/g, " ");
}

function formatClaimableDraws(reasons: GameStatus["claimableDraws"]): string {
  return reasons.map((reason) => formatReason(reason)).join(" or ");
}

function playerLabel(color: Color, mode: ExtendedGameMode, humanColor: Color): string {
  if (mode === "human") {
    return colorName(color);
  }
  if (mode === "multiplayer") {
    return color === humanColor ? `${colorName(color)} · You` : `${colorName(color)} · Opponent`;
  }

  return color === humanColor ? `${colorName(color)} · You` : `${colorName(color)} · AI`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "AI move failed.";
}

// ─── Sub-components ──────────────────────────────────────────────────────────

interface PlayerBarProps {
  color: Color;
  label: string;
  capturedByThis: Piece[];
  advantage: number;
  isActiveTurn: boolean;
  isInCheck: boolean;
  isGameOver: boolean;
  isThinking?: boolean;
}

function PlayerBar({
  color,
  label,
  capturedByThis,
  advantage,
  isActiveTurn,
  isInCheck,
  isGameOver,
  isThinking = false,
}: PlayerBarProps) {
  const cls = [
    "player-bar",
    isActiveTurn && !isGameOver ? "player-bar--active" : "",
    isInCheck ? "player-bar--check" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={cls}>
      <div className={`player-avatar player-avatar--${color}`} aria-hidden="true" />
      <span className="player-name">{label}</span>
      <div className="player-captures" aria-label={`${colorName(color)} captured pieces`}>
        {capturedByThis.map((piece, i) => (
          <span key={i} className="captured-icon" aria-hidden="true">
            {PIECE_SYMBOLS[piece.color][piece.type]}
          </span>
        ))}
        {advantage > 0 && <span className="material-adv">+{advantage}</span>}
      </div>
      {isActiveTurn && !isGameOver && !isInCheck && !isThinking && (
        <span className="turn-dot" aria-label="Active turn" />
      )}
      {isInCheck && <span className="check-badge">Check</span>}
      {isThinking && <span className="thinking-badge">Thinking…</span>}
    </div>
  );
}

interface AIControlsProps {
  mode: ExtendedGameMode;
  playerColor: Color;
  difficulty: AIDifficulty;
  aiColor: Color;
  aiReady: boolean;
  aiThinking: boolean;
  aiError: string | null;
  searchingMatch: boolean;
  multiplayerId: string | null;
  onModeChange: (mode: ExtendedGameMode) => void;
  onPlayerColorChange: (color: Color) => void;
  onDifficultyChange: (difficulty: AIDifficulty) => void;
  onFindGame: () => void;
  onReset: () => void;
}

function AIControls({
  mode,
  playerColor,
  difficulty,
  aiColor,
  aiReady,
  aiThinking,
  aiError,
  searchingMatch,
  multiplayerId,
  onModeChange,
  onPlayerColorChange,
  onDifficultyChange,
  onFindGame,
  onReset,
}: AIControlsProps) {
  const statusText =
    mode === "human"
      ? "Pass-and-play mode."
      : mode === "multiplayer"
        ? multiplayerId
          ? "Connected to opponent."
          : searchingMatch
            ? "Searching for opponent..."
            : "Click 'Find Game' to start."
        : aiThinking
          ? aiReady
            ? "AI thinking..."
            : "Loading AI..."
          : aiReady
            ? `AI plays ${colorName(aiColor)}.`
            : "AI will load on demand.";

  return (
    <div className="card">
      <p className="card-label">Opponent</p>
      <div className="segmented-control">
        <button
          type="button"
          className={`segment${mode === "human" ? " segment--active" : ""}`}
          onClick={() => onModeChange("human")}
        >
          Local
        </button>
        <button
          type="button"
          className={`segment${mode === "ai" ? " segment--active" : ""}`}
          onClick={() => onModeChange("ai")}
        >
          AI
        </button>
        <button
          type="button"
          className={`segment${mode === "multiplayer" ? " segment--active" : ""}`}
          onClick={() => onModeChange("multiplayer")}
        >
          Online
        </button>
      </div>

      {mode === "ai" && (
        <>
          <div className="control-group">
            <span className="control-label">Play as</span>
            <div className="segmented-control">
              <button
                type="button"
                className={`segment${playerColor === "w" ? " segment--active" : ""}`}
                onClick={() => onPlayerColorChange("w")}
              >
                White
              </button>
              <button
                type="button"
                className={`segment${playerColor === "b" ? " segment--active" : ""}`}
                onClick={() => onPlayerColorChange("b")}
              >
                Black
              </button>
            </div>
          </div>

          <div className="control-group">
            <span className="control-label">Difficulty</span>
            <div className="segmented-control segmented-control--triple">
              {(
                Object.entries(AI_DIFFICULTY_SETTINGS) as Array<
                  [AIDifficulty, (typeof AI_DIFFICULTY_SETTINGS)[AIDifficulty]]
                >
              ).map(([key, settings]) => (
                <button
                  key={key}
                  type="button"
                  className={`segment${difficulty === key ? " segment--active" : ""}`}
                  onClick={() => onDifficultyChange(key)}
                >
                  {settings.label}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {mode === "multiplayer" && !multiplayerId && (
        <button
          type="button"
          className="btn btn-accent find-game-btn"
          onClick={onFindGame}
          disabled={searchingMatch}
        >
          {searchingMatch ? "Searching..." : "Find Game"}
        </button>
      )}

      <div
        className={`engine-status${aiThinking || searchingMatch ? " engine-status--thinking" : ""}`}
        role="status"
        aria-live="polite"
      >
        <span
          className={`engine-dot${aiThinking || searchingMatch ? " engine-dot--thinking" : ""}`}
          aria-hidden="true"
        />
        <span>{statusText}</span>
      </div>

      {aiError ? <p className="engine-error">{aiError}</p> : null}

      {mode !== "multiplayer" && (
        <button type="button" className="btn btn-ghost control-reset" onClick={onReset}>
          New game
        </button>
      )}
    </div>
  );
}

interface GameInfoProps {
  state: ChessState;
  status: GameStatus;
  claimDrawDisabled?: boolean;
  onClaimDraw: () => void;
  onReset: () => void;
}

function GameInfo({
  state,
  status,
  claimDrawDisabled = false,
  onClaimDraw,
  onReset,
}: GameInfoProps) {
  if (status.result) {
    return (
      <div className="card result-card">
        <div className="result-icon" aria-hidden="true">
          {resultIcon(status.result)}
        </div>
        <h2 className="result-headline">{resultHeadline(status.result)}</h2>
        <p className="result-reason">{formatReason(status.result.reason)}</p>
        <button type="button" className="btn btn-accent result-new-game" onClick={onReset}>
          Play again
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <p className="card-label">Status</p>
      <div className="turn-row">
        <span className={`color-pip color-pip--${state.sideToMove}`} aria-hidden="true" />
        <span className="turn-text">{colorName(state.sideToMove)} to move</span>
      </div>
      {status.inCheck && (
        <div className="check-alert" role="alert">
          ⚠ In check
        </div>
      )}
      <div className="stat-grid">
        <div className="stat-cell">
          <span className="stat-label">Move</span>
          <span className="stat-value">{state.fullmoveNumber}</span>
        </div>
        <div className="stat-cell">
          <span className="stat-label">50-move</span>
          <span className="stat-value">{state.halfmoveClock}</span>
        </div>
      </div>
      {status.claimableDraws.length > 0 && (
        <div className="claim-draw-row">
          <p className="result-reason">
            Draw available by claim: {formatClaimableDraws(status.claimableDraws)}
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={onClaimDraw}
            disabled={claimDrawDisabled}
          >
            Claim draw
          </button>
        </div>
      )}
    </div>
  );
}

interface PromotionOverlayProps {
  request: PromotionRequest;
  sideToMove: Color;
  onChoose: (p: PieceType) => void;
  onCancel: () => void;
}

function PromotionOverlay({ request, sideToMove, onChoose, onCancel }: PromotionOverlayProps) {
  return (
    <div className="modal-overlay" onClick={onCancel} role="presentation">
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Choose promotion piece"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="modal-title">Promote pawn</h2>
        <p className="modal-desc">
          {indexToAlgebraic(request.from)} → {indexToAlgebraic(request.to)}
        </p>
        <div className="promotion-grid">
          {PROMOTION_ORDER.map((pieceType) => {
            const move = request.options.find((o) => o.promotion === pieceType);
            if (!move) return null;
            return (
              <button
                key={pieceType}
                type="button"
                className="promotion-option"
                onClick={() => onChoose(pieceType)}
              >
                <span className="promo-symbol" aria-hidden="true">
                  {PIECE_SYMBOLS[sideToMove][pieceType]}
                </span>
                <span className="promo-name">{PIECE_NAMES[pieceType]}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const gameRef = useRef(new ChessGame());
  const aiManagerRef = useRef<StockfishManager | null>(null);
  const aiRequestTokenRef = useRef(0);
  const aiPreparedGameRef = useRef<number | null>(null);
  const moveSoundRef = useRef<HTMLAudioElement | null>(null);
  const hubConnectionRef = useRef<signalR.HubConnection | null>(null);

  const [, setVersion] = useState(0);
  const [gameSession, setGameSession] = useState(0);
  const [selectedSquare, setSelectedSquare] = useState<number | null>(null);
  const [dragSource, setDragSource] = useState<number | null>(null);
  const [promotionRequest, setPromotionRequest] = useState<PromotionRequest | null>(null);
  const [gameMode, setGameMode] = useState<ExtendedGameMode>("human");
  const [playerColor, setPlayerColor] = useState<Color>("w");
  const [aiThinking, setAiThinking] = useState(false);
  const [aiReady, setAiReady] = useState(false);
  const [aiDifficulty, setAiDifficulty] = useState<AIDifficulty>("medium");
  const [aiError, setAiError] = useState<string | null>(null);

  const [searchingMatch, setSearchingMatch] = useState(false);
  const [multiplayerId, setMultiplayerId] = useState<string | null>(null);

  const game = gameRef.current;
  const state = game.getState();
  const status = game.getStatus();
  const currentFen = game.toFen();
  const moveHistory = game.getMoveHistory();
  const selectableMoves = selectedSquare === null ? [] : game.getLegalMovesFrom(selectedSquare);
  const aiColor = oppositeColor(playerColor);
  const isAiMode = gameMode === "ai";
  const isMultiplayerMode = gameMode === "multiplayer";
  const isAiTurn = isAiMode && state.sideToMove === aiColor;
  const isOpponentTurn = isMultiplayerMode && state.sideToMove !== playerColor;
  const boardLocked = Boolean(
    promotionRequest ||
    status.result ||
    (isAiMode && isAiTurn) ||
    (isMultiplayerMode && (!multiplayerId || isOpponentTurn)) ||
    aiThinking,
  );

  const whiteScore = materialScore(state.capturedPieces.b);
  const blackScore = materialScore(state.capturedPieces.w);
  const whiteAdv = Math.max(0, whiteScore - blackScore);
  const blackAdv = Math.max(0, blackScore - whiteScore);

  const headerBadge = useMemo(() => {
    if (status.result) {
      return (
        <span className="badge badge-result">
          {resultHeadline(status.result)} · {formatReason(status.result.reason)}
        </span>
      );
    }

    if (isMultiplayerMode && !multiplayerId) {
      return (
        <span className="badge badge-turn">
          {searchingMatch ? "Searching for opponent..." : "Waiting to find game"}
        </span>
      );
    }

    const sideText = state.sideToMove === "w" ? "White's Turn" : "Black's Turn";
    const isYou =
      isMultiplayerMode || isAiMode
        ? state.sideToMove === playerColor
          ? " (You)"
          : " (Opponent)"
        : "";

    return (
      <span
        className={`badge badge-turn${status.inCheck ? " badge-check" : ""}`}
        style={{ fontSize: "1rem", padding: "8px 20px" }}
      >
        <span
          className={`pip pip-${state.sideToMove}`}
          aria-hidden="true"
          style={{ width: "12px", height: "12px" }}
        />
        {sideText}
        {isYou}
        {status.inCheck ? " · CHECK!" : ""}
      </span>
    );
  }, [
    state.sideToMove,
    status.inCheck,
    status.result,
    isMultiplayerMode,
    multiplayerId,
    searchingMatch,
    isAiMode,
    playerColor,
  ]);

  const refresh = () => setVersion((v) => v + 1);

  const playMoveSound = () => {
    const sound = moveSoundRef.current ?? new Audio(MOVE_SOUND_SRC);
    if (moveSoundRef.current === null) {
      sound.preload = "auto";
      moveSoundRef.current = sound;
    }

    sound.currentTime = 0;
    const playPromise = sound.play();
    if (playPromise && typeof playPromise.catch === "function") {
      void playPromise.catch(() => {});
    }
  };

  const clearSelection = () => {
    setSelectedSquare(null);
    setDragSource(null);
    setPromotionRequest(null);
  };

  const finalizeMove = (sendToHub = true) => {
    clearSelection();
    playMoveSound();
    refresh();

    if (sendToHub && isMultiplayerMode && multiplayerId) {
      const lastMove = game.getMoveHistory().at(-1);
      if (lastMove) {
        // Simple string representation of move for now: e2e4 or e7e8q
        const moveStr =
          indexToAlgebraic(lastMove.move.from) +
          indexToAlgebraic(lastMove.move.to) +
          (lastMove.move.promotion || "");
        hubConnectionRef.current?.invoke("SendMove", multiplayerId, moveStr);
      }
    }
  };

  const cancelAI = (dispose = false) => {
    aiRequestTokenRef.current += 1;
    aiManagerRef.current?.stopSearch();
    setAiThinking(false);

    if (dispose) {
      aiManagerRef.current?.dispose();
      aiManagerRef.current = null;
      aiPreparedGameRef.current = null;
      setAiReady(false);
    }
  };

  const ensureAIManager = async (): Promise<StockfishManager> => {
    if (!aiManagerRef.current) {
      const module = await import("./ai/stockfishManager");
      aiManagerRef.current = new module.StockfishManager();
      setAiReady(false);
    }

    return aiManagerRef.current;
  };

  const requestMove = (from: number, to: number) => {
    const candidateMoves = game.getLegalMovesFrom(from).filter((m) => m.to === to);
    if (candidateMoves.length === 0) return false;

    if (candidateMoves.some((m) => m.promotion)) {
      setPromotionRequest({ from, to, options: candidateMoves });
      return true;
    }

    const moved = game.move(from, to);
    if (moved) {
      finalizeMove();
    }
    return moved;
  };

  // SignalR setup
  useEffect(() => {
    const connection = new signalR.HubConnectionBuilder()
      .withUrl(`${BACKEND_URL}/gamehub`)
      .withAutomaticReconnect()
      .build();

    connection.on("WaitingForOpponent", () => {
      setSearchingMatch(true);
    });

    connection.on("GameStarted", (gameId: string, assignedColor: string) => {
      setMultiplayerId(gameId);
      setSearchingMatch(false);
      setPlayerColor(assignedColor === "white" ? "w" : "b");
      handleReset();
    });

    connection.on("ReceiveMove", (moveStr: string) => {
      // Basic UCI parser for receive move
      const from = moveStr.slice(0, 2);
      const to = moveStr.slice(2, 4);
      const prom = moveStr[4] as PieceType | undefined;

      const fromIdx = (8 - Number.parseInt(from[1])) * 8 + (from.charCodeAt(0) - 97);
      const toIdx = (8 - Number.parseInt(to[1])) * 8 + (to.charCodeAt(0) - 97);

      if (game.move(fromIdx, toIdx, prom)) {
        finalizeMove(false);
      }
    });

    connection.on("OpponentDisconnected", () => {
      alert("Opponent disconnected.");
      setMultiplayerId(null);
      setGameMode("human");
    });

    connection
      .start()
      .then(() => {
        hubConnectionRef.current = connection;
      })
      .catch((err) => console.error("SignalR Connection Error: ", err));

    return () => {
      connection.stop();
    };
  }, []);

  useEffect(() => {
    return () => {
      moveSoundRef.current?.pause();
      aiManagerRef.current?.dispose();
    };
  }, []);

  useEffect(() => {
    if (gameMode !== "ai") {
      cancelAI(true);
      setAiError(null);
      return;
    }

    let cancelled = false;
    setAiError(null);
    setAiReady(false);

    void ensureAIManager()
      .then((manager) => manager.ensureReady())
      .then(() => {
        if (!cancelled) {
          setAiReady(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setAiError(errorMessage(error));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [gameMode]);

  useEffect(() => {
    if (!isAiMode || !isAiTurn || promotionRequest || status.result) {
      return;
    }

    let cancelled = false;
    const requestToken = ++aiRequestTokenRef.current;
    setAiThinking(true);
    setAiError(null);
    clearSelection();

    void (async () => {
      try {
        const manager = await ensureAIManager();

        if (aiPreparedGameRef.current !== gameSession) {
          await manager.newGame();
          aiPreparedGameRef.current = gameSession;
        } else {
          await manager.ensureReady();
        }

        if (cancelled || aiRequestTokenRef.current !== requestToken) {
          return;
        }

        setAiReady(true);

        const bestMove = await manager.getBestMove(currentFen, aiDifficulty);
        if (cancelled || aiRequestTokenRef.current !== requestToken) {
          return;
        }

        const parsedMove = bestMove ? parseUciMove(bestMove) : null;
        if (!parsedMove) {
          throw new Error("AI did not return a legal move.");
        }

        await sleep(AI_MOVE_DELAY_MS);
        if (cancelled || aiRequestTokenRef.current !== requestToken) {
          return;
        }

        const moved = game.move(parsedMove.from, parsedMove.to, parsedMove.promotion);
        if (!moved) {
          throw new Error(`AI suggested an invalid move: ${bestMove}`);
        }

        finalizeMove();
      } catch (error) {
        if (!cancelled && aiRequestTokenRef.current === requestToken) {
          setAiError(errorMessage(error));
        }
      } finally {
        if (!cancelled && aiRequestTokenRef.current === requestToken) {
          setAiThinking(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      aiManagerRef.current?.stopSearch();
    };
  }, [aiDifficulty, currentFen, gameSession, isAiMode, isAiTurn, promotionRequest, status.result]);

  const handleSquareClick = (square: number) => {
    if (boardLocked) return;

    const piece = game.getPiece(square);

    if (selectedSquare === square) {
      clearSelection();
      return;
    }

    if (selectedSquare === null) {
      if (piece && piece.color === state.sideToMove) setSelectedSquare(square);
      return;
    }

    if (requestMove(selectedSquare, square)) return;

    if (piece && piece.color === state.sideToMove) {
      setSelectedSquare(square);
    } else {
      clearSelection();
    }
  };

  const handlePieceDragStart = (square: number) => {
    if (boardLocked) return;
    const piece = game.getPiece(square);
    if (!piece || piece.color !== state.sideToMove) return;
    setSelectedSquare(square);
    setDragSource(square);
  };

  const handlePieceDrop = (targetSquare: number) => {
    if (boardLocked) return;
    const from = dragSource ?? selectedSquare;
    if (from === null) return;

    if (!requestMove(from, targetSquare)) {
      const targetPiece = game.getPiece(targetSquare);
      if (targetPiece && targetPiece.color === state.sideToMove) setSelectedSquare(targetSquare);
      setDragSource(null);
    }
  };

  const handlePromotionChoice = (promotion: PieceType) => {
    if (!promotionRequest) return;
    const moved = game.move(promotionRequest.from, promotionRequest.to, promotion);
    if (moved) {
      finalizeMove();
      return;
    }
    setPromotionRequest(null);
  };

  const handleReset = () => {
    cancelAI();
    game.reset();
    setGameSession((session) => session + 1);
    clearSelection();
    refresh();
  };

  const handleUndo = () => {
    if (isMultiplayerMode) return; // Disable undo in multiplayer
    cancelAI();

    if (!game.undo()) {
      return;
    }

    if (isAiMode) {
      while (game.getMoveHistory().length > 0 && game.getState().sideToMove !== playerColor) {
        if (!game.undo()) {
          break;
        }
      }
    }

    clearSelection();
    refresh();
  };

  const handleClaimDraw = () => {
    if (isAiTurn || aiThinking) {
      return;
    }

    cancelAI();
    if (game.claimDraw()) {
      clearSelection();
      refresh();
    }
  };

  const handleFindGame = () => {
    if (hubConnectionRef.current) {
      hubConnectionRef.current.invoke("FindGame");
    }
  };

  const handleModeChange = (newMode: ExtendedGameMode) => {
    if (newMode === "multiplayer") {
      setPlayerColor("w"); // Default until game starts
    }
    setGameMode(newMode);
    setMultiplayerId(null);
    setSearchingMatch(false);
    handleReset();
  };

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <div className="brand">
          <span className="brand-piece" aria-hidden="true">
            ♟
          </span>
          <span className="brand-name">Chess</span>
        </div>
        <div className="header-status">{headerBadge}</div>
        <div className="header-controls">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={handleUndo}
            disabled={moveHistory.length === 0 || aiThinking || isAiTurn || isMultiplayerMode}
          >
            ↩ Undo
          </button>
          <button
            type="button"
            className="btn btn-accent"
            onClick={handleReset}
            disabled={isMultiplayerMode}
          >
            New game
          </button>
        </div>
      </header>

      {/* Main */}
      <div className="main-layout">
        {/* Board column */}
        <div className="board-area">
          <PlayerBar
            color="b"
            label={playerLabel("b", gameMode, playerColor)}
            capturedByThis={state.capturedPieces.w}
            advantage={blackAdv}
            isActiveTurn={state.sideToMove === "b"}
            isInCheck={status.inCheck && state.sideToMove === "b"}
            isGameOver={!!status.result}
            isThinking={isAiMode && aiThinking && aiColor === "b"}
          />
          <ChessBoard
            state={state}
            selectedSquare={selectedSquare}
            legalMoves={selectableMoves}
            inCheck={status.inCheck}
            interactionDisabled={boardLocked}
            perspective={playerColor}
            onSquareClick={handleSquareClick}
            onPieceDragStart={handlePieceDragStart}
            onPieceDrop={handlePieceDrop}
          />
          <PlayerBar
            color="w"
            label={playerLabel("w", gameMode, playerColor)}
            capturedByThis={state.capturedPieces.b}
            advantage={whiteAdv}
            isActiveTurn={state.sideToMove === "w"}
            isInCheck={status.inCheck && state.sideToMove === "w"}
            isGameOver={!!status.result}
            isThinking={isAiMode && aiThinking && aiColor === "w"}
          />
        </div>

        {/* Sidebar */}
        <aside className="sidebar">
          <AIControls
            mode={gameMode}
            playerColor={playerColor}
            difficulty={aiDifficulty}
            aiColor={aiColor}
            aiReady={aiReady}
            aiThinking={aiThinking}
            aiError={aiError}
            searchingMatch={searchingMatch}
            multiplayerId={multiplayerId}
            onModeChange={handleModeChange}
            onPlayerColorChange={setPlayerColor}
            onDifficultyChange={setAiDifficulty}
            onFindGame={handleFindGame}
            onReset={handleReset}
          />
          <GameInfo
            state={state}
            status={status}
            claimDrawDisabled={isAiTurn || aiThinking}
            onClaimDraw={handleClaimDraw}
            onReset={handleReset}
          />
          <MoveList moves={moveHistory} />
        </aside>
      </div>

      {/* Promotion overlay */}
      {promotionRequest && (
        <PromotionOverlay
          request={promotionRequest}
          sideToMove={state.sideToMove}
          onChoose={handlePromotionChoice}
          onCancel={() => setPromotionRequest(null)}
        />
      )}
    </div>
  );
}
