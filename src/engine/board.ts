import type { Board, CastlingRights, ChessState, Color, Piece, PieceType } from "./types";

export const FILES = ["a", "b", "c", "d", "e", "f", "g", "h"] as const;

export const PIECE_LETTERS: Record<PieceType, string> = {
  p: "",
  n: "N",
  b: "B",
  r: "R",
  q: "Q",
  k: "K",
};

export const PIECE_SYMBOLS: Record<Color, Record<PieceType, string>> = {
  w: {
    p: "\u2659",
    n: "\u2658",
    b: "\u2657",
    r: "\u2656",
    q: "\u2655",
    k: "\u2654",
  },
  b: {
    p: "\u265F",
    n: "\u265E",
    b: "\u265D",
    r: "\u265C",
    q: "\u265B",
    k: "\u265A",
  },
};

export function createEmptyBoard(): Board {
  // Board indices run from 0..63 in row-major order with 0 = a8 and 63 = h1.
  // This keeps rank/file math simple while matching how the UI renders the board.
  return Array.from({ length: 64 }, () => null);
}

export function createCastlingRights(): CastlingRights {
  return {
    w: { kingside: true, queenside: true },
    b: { kingside: true, queenside: true },
  };
}

export function createInitialState(): ChessState {
  const board = createEmptyBoard();
  const backRank: PieceType[] = ["r", "n", "b", "q", "k", "b", "n", "r"];

  for (let file = 0; file < 8; file += 1) {
    board[file] = { color: "b", type: backRank[file] };
    board[8 + file] = { color: "b", type: "p" };
    board[48 + file] = { color: "w", type: "p" };
    board[56 + file] = { color: "w", type: backRank[file] };
  }

  return {
    board,
    sideToMove: "w",
    castlingRights: createCastlingRights(),
    enPassantTarget: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    capturedPieces: { w: [], b: [] },
    lastMove: null,
  };
}

export function clonePiece(piece: Piece | null): Piece | null {
  return piece ? { ...piece } : null;
}

export function cloneState(state: ChessState): ChessState {
  return {
    board: state.board.map((piece) => clonePiece(piece)),
    sideToMove: state.sideToMove,
    castlingRights: {
      w: { ...state.castlingRights.w },
      b: { ...state.castlingRights.b },
    },
    enPassantTarget: state.enPassantTarget,
    halfmoveClock: state.halfmoveClock,
    fullmoveNumber: state.fullmoveNumber,
    capturedPieces: {
      w: state.capturedPieces.w.map((piece) => ({ ...piece })),
      b: state.capturedPieces.b.map((piece) => ({ ...piece })),
    },
    lastMove: state.lastMove
      ? {
          ...state.lastMove,
          piece: { ...state.lastMove.piece },
          captured: state.lastMove.captured ? { ...state.lastMove.captured } : undefined,
        }
      : null,
  };
}

export function getFile(index: number): number {
  return index % 8;
}

export function getRankIndex(index: number): number {
  return Math.floor(index / 8);
}

export function isOnBoard(index: number): boolean {
  return index >= 0 && index < 64;
}

export function indexToAlgebraic(index: number): string {
  const file = FILES[getFile(index)];
  const rank = 8 - getRankIndex(index);
  return `${file}${rank}`;
}

export function algebraicToIndex(square: string): number {
  const file = FILES.indexOf(square[0] as (typeof FILES)[number]);
  const rank = Number(square[1]);

  if (file === -1 || Number.isNaN(rank) || rank < 1 || rank > 8) {
    throw new Error(`Invalid square: ${square}`);
  }

  return (8 - rank) * 8 + file;
}

export function isLightSquare(index: number): boolean {
  return (getFile(index) + getRankIndex(index)) % 2 === 1;
}

export function oppositeColor(color: Color): Color {
  return color === "w" ? "b" : "w";
}

export function pieceKey(piece: Piece): string {
  return `${piece.color}${piece.type}`;
}
