import { algebraicToIndex } from "../engine/ChessGame";
import type { PieceType } from "../engine/types";

export interface ParsedUciMove {
  from: number;
  to: number;
  promotion?: PieceType;
}

export function parseBestMove(line: string): string | null {
  const match = line.match(/^bestmove\s+(\S+)/);
  if (!match || match[1] === "(none)") {
    return null;
  }

  return match[1];
}

export function parseUciMove(move: string): ParsedUciMove | null {
  const normalized = move.trim().toLowerCase();
  const match = normalized.match(/^([a-h][1-8])([a-h][1-8])([qrbn])?$/);
  if (!match) {
    return null;
  }

  return {
    from: algebraicToIndex(match[1]),
    to: algebraicToIndex(match[2]),
    promotion: match[3] as PieceType | undefined,
  };
}
