import { FILES, PIECE_SYMBOLS, getFile, getRankIndex, indexToAlgebraic } from "../engine/board";
import type { ChessState, Color, Move, Piece } from "../engine/types";

interface ChessBoardProps {
  state: ChessState;
  selectedSquare: number | null;
  legalMoves: Move[];
  inCheck: boolean;
  interactionDisabled?: boolean;
  perspective?: Color;
  onSquareClick: (square: number) => void;
  onPieceDragStart: (square: number) => void;
  onPieceDrop: (targetSquare: number) => void;
}

function isMovablePiece(piece: Piece | null, state: ChessState): boolean {
  return Boolean(piece && piece.color === state.sideToMove);
}

export function ChessBoard({
  state,
  selectedSquare,
  legalMoves,
  inCheck,
  interactionDisabled = false,
  perspective = "w",
  onSquareClick,
  onPieceDragStart,
  onPieceDrop,
}: ChessBoardProps) {
  const legalTargetMap = new Map<number, Move[]>();
  for (const move of legalMoves) {
    const existing = legalTargetMap.get(move.to) ?? [];
    existing.push(move);
    legalTargetMap.set(move.to, existing);
  }

  // Find the king in check so we can highlight it
  const checkSquare = inCheck
    ? state.board.findIndex((p) => p !== null && p.type === "k" && p.color === state.sideToMove)
    : -1;
  const displaySquares =
    perspective === "w"
      ? Array.from({ length: 64 }, (_, square) => square)
      : Array.from({ length: 64 }, (_, square) => 63 - square);

  return (
    <div className={`board-shell${interactionDisabled ? " board-shell--locked" : ""}`}>
      <div className="board" role="grid" aria-label="Chess board">
        {displaySquares.map((square, displayIndex) => {
          const piece = state.board[square];
          const isLight = (getFile(square) + getRankIndex(square)) % 2 === 1;
          const isSelected = selectedSquare === square;
          const isLastMove = state.lastMove
            ? square === state.lastMove.from || square === state.lastMove.to
            : false;
          const legalTargets = legalTargetMap.get(square) ?? [];
          const isLegalTarget = legalTargets.length > 0;
          const isInCheck = square === checkSquare;
          const label = indexToAlgebraic(square);
          const rank = 8 - getRankIndex(square);
          const file = FILES[getFile(square)];
          const isCapture = isLegalTarget && piece !== null;
          const displayFile = displayIndex % 8;
          const displayRank = Math.floor(displayIndex / 8);

          const squareCls = [
            "square",
            isLight ? "light" : "dark",
            isSelected ? "selected" : "",
            isLastMove && !isSelected ? "last-move" : "",
            isInCheck ? "in-check" : "",
          ]
            .filter(Boolean)
            .join(" ");

          return (
            <button
              key={square}
              type="button"
              className={squareCls}
              disabled={interactionDisabled}
              onClick={() => onSquareClick(square)}
              onDragOver={(e) => {
                if (!interactionDisabled && selectedSquare !== null) e.preventDefault();
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!interactionDisabled) {
                  onPieceDrop(square);
                }
              }}
              aria-label={`Square ${label}${piece ? `, ${piece.color === "w" ? "white" : "black"} ${piece.type}` : ""}${isSelected ? ", selected" : ""}${isLegalTarget ? ", legal target" : ""}`}
            >
              {displayFile === 0 ? (
                <span className="rank-label" aria-hidden="true">
                  {rank}
                </span>
              ) : null}
              {displayRank === 7 ? (
                <span className="file-label" aria-hidden="true">
                  {file}
                </span>
              ) : null}
              {isLegalTarget ? (
                <span
                  className={isCapture ? "legal-indicator capture" : "legal-indicator move"}
                  aria-hidden="true"
                />
              ) : null}
              {piece ? (
                <span
                  className={`piece ${piece.color === "w" ? "white-piece" : "black-piece"}`}
                  draggable={!interactionDisabled && isMovablePiece(piece, state)}
                  onDragStart={() => onPieceDragStart(square)}
                >
                  {PIECE_SYMBOLS[piece.color][piece.type]}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
