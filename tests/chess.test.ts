import { describe, expect, it } from "vitest";
import { ChessGame, algebraicToIndex, createEmptyBoard } from "../src/engine/ChessGame";
import type { ChessState, Color, Piece, PieceType } from "../src/engine/ChessGame";

function piece(color: Color, type: PieceType): Piece {
  return { color, type };
}

function createState(
  placements: Record<string, Piece>,
  overrides: Partial<ChessState> = {},
): ChessState {
  const board = createEmptyBoard();

  for (const [square, chessPiece] of Object.entries(placements)) {
    board[algebraicToIndex(square)] = { ...chessPiece };
  }

  return {
    board,
    sideToMove: "w",
    castlingRights: {
      w: { kingside: false, queenside: false },
      b: { kingside: false, queenside: false },
    },
    enPassantTarget: null,
    halfmoveClock: 0,
    fullmoveNumber: 1,
    capturedPieces: { w: [], b: [] },
    lastMove: null,
    ...overrides,
  };
}

describe("ChessGame engine", () => {
  it("allows basic legal movement", () => {
    const game = new ChessGame();

    expect(game.moveByAlgebraic("e2", "e4")).toBe(true);
    expect(game.moveByAlgebraic("e7", "e5")).toBe(true);
    expect(game.moveByAlgebraic("g1", "f3")).toBe(true);
    expect(game.getPiece(algebraicToIndex("f3"))).toEqual(piece("w", "n"));
  });

  it("rejects illegal moves", () => {
    const game = new ChessGame();

    expect(game.moveByAlgebraic("c1", "h6")).toBe(false);
    expect(game.moveByAlgebraic("e2", "e5")).toBe(false);
    expect(game.getPiece(algebraicToIndex("c1"))).toEqual(piece("w", "b"));
  });

  it("blocks moves that leave the king in check", () => {
    const game = new ChessGame(
      createState(
        {
          e1: piece("w", "k"),
          e2: piece("w", "r"),
          e8: piece("b", "r"),
          a8: piece("b", "k"),
        },
        { sideToMove: "w" },
      ),
    );

    expect(game.moveByAlgebraic("e2", "d2")).toBe(false);
    expect(game.moveByAlgebraic("e2", "e3")).toBe(true);
  });

  it("allows legal castling on both sides", () => {
    const game = new ChessGame(
      createState(
        {
          e1: piece("w", "k"),
          h1: piece("w", "r"),
          e8: piece("b", "k"),
          a8: piece("b", "r"),
        },
        {
          sideToMove: "w",
          castlingRights: {
            w: { kingside: true, queenside: false },
            b: { kingside: false, queenside: true },
          },
        },
      ),
    );

    expect(game.moveByAlgebraic("e1", "g1")).toBe(true);
    expect(game.getPiece(algebraicToIndex("g1"))).toEqual(piece("w", "k"));
    expect(game.getPiece(algebraicToIndex("f1"))).toEqual(piece("w", "r"));

    expect(game.moveByAlgebraic("e8", "c8")).toBe(true);
    expect(game.getPiece(algebraicToIndex("c8"))).toEqual(piece("b", "k"));
    expect(game.getPiece(algebraicToIndex("d8"))).toEqual(piece("b", "r"));
  });

  it("blocks castling while in check or through check", () => {
    const inCheckGame = new ChessGame(
      createState(
        {
          e1: piece("w", "k"),
          h1: piece("w", "r"),
          e8: piece("b", "r"),
          a8: piece("b", "k"),
        },
        {
          castlingRights: {
            w: { kingside: true, queenside: false },
            b: { kingside: false, queenside: false },
          },
        },
      ),
    );

    expect(inCheckGame.moveByAlgebraic("e1", "g1")).toBe(false);

    const throughCheckGame = new ChessGame(
      createState(
        {
          e1: piece("w", "k"),
          h1: piece("w", "r"),
          c4: piece("b", "b"),
          a8: piece("b", "k"),
        },
        {
          castlingRights: {
            w: { kingside: true, queenside: false },
            b: { kingside: false, queenside: false },
          },
        },
      ),
    );

    expect(throughCheckGame.moveByAlgebraic("e1", "g1")).toBe(false);
  });

  it("handles en passant only on the immediate legal turn", () => {
    const legalGame = new ChessGame();
    expect(legalGame.moveByAlgebraic("e2", "e4")).toBe(true);
    expect(legalGame.moveByAlgebraic("a7", "a6")).toBe(true);
    expect(legalGame.moveByAlgebraic("e4", "e5")).toBe(true);
    expect(legalGame.moveByAlgebraic("d7", "d5")).toBe(true);
    expect(legalGame.moveByAlgebraic("e5", "d6")).toBe(true);
    expect(legalGame.getPiece(algebraicToIndex("d6"))).toEqual(piece("w", "p"));
    expect(legalGame.getPiece(algebraicToIndex("d5"))).toBeNull();

    const expiredGame = new ChessGame();
    expect(expiredGame.moveByAlgebraic("e2", "e4")).toBe(true);
    expect(expiredGame.moveByAlgebraic("a7", "a6")).toBe(true);
    expect(expiredGame.moveByAlgebraic("e4", "e5")).toBe(true);
    expect(expiredGame.moveByAlgebraic("d7", "d5")).toBe(true);
    expect(expiredGame.moveByAlgebraic("g1", "f3")).toBe(true);
    expect(expiredGame.moveByAlgebraic("a6", "a5")).toBe(true);
    expect(expiredGame.moveByAlgebraic("e5", "d6")).toBe(false);
  });

  it("promotes a pawn with the chosen piece", () => {
    const game = new ChessGame(
      createState({
        e1: piece("w", "k"),
        h8: piece("b", "k"),
        g7: piece("w", "p"),
      }),
    );

    const promotionMoves = game
      .getLegalMovesFrom(algebraicToIndex("g7"))
      .filter((move) => move.to === algebraicToIndex("g8"));
    expect(promotionMoves).toHaveLength(4);
    expect(game.moveByAlgebraic("g7", "g8", "n")).toBe(true);
    expect(game.getPiece(algebraicToIndex("g8"))).toEqual(piece("w", "n"));
  });

  it("detects checkmate", () => {
    const game = new ChessGame();

    expect(game.moveByAlgebraic("f2", "f3")).toBe(true);
    expect(game.moveByAlgebraic("e7", "e5")).toBe(true);
    expect(game.moveByAlgebraic("g2", "g4")).toBe(true);
    expect(game.moveByAlgebraic("d8", "h4")).toBe(true);

    const status = game.getStatus();
    expect(status.result?.reason).toBe("checkmate");
    expect(status.result?.winner).toBe("b");
  });

  it("detects stalemate", () => {
    const game = new ChessGame(
      createState(
        {
          h8: piece("b", "k"),
          f7: piece("w", "k"),
          g6: piece("w", "q"),
        },
        { sideToMove: "b" },
      ),
    );

    const status = game.getStatus();
    expect(status.result?.reason).toBe("stalemate");
    expect(status.inCheck).toBe(false);
  });

  it("offers a draw claim on threefold repetition without ending the game", () => {
    const game = new ChessGame();
    const sequence: Array<[string, string]> = [
      ["g1", "f3"],
      ["g8", "f6"],
      ["f3", "g1"],
      ["f6", "g8"],
      ["g1", "f3"],
      ["g8", "f6"],
      ["f3", "g1"],
      ["f6", "g8"],
    ];

    for (const [from, to] of sequence) {
      expect(game.moveByAlgebraic(from, to)).toBe(true);
    }

    const status = game.getStatus();
    expect(status.result).toBeNull();
    expect(status.claimableDraws).toContain("threefold-repetition");
    expect(game.moveByAlgebraic("b1", "c3")).toBe(true);
  });

  it("allows claiming a threefold repetition draw", () => {
    const game = new ChessGame();
    const sequence: Array<[string, string]> = [
      ["g1", "f3"],
      ["g8", "f6"],
      ["f3", "g1"],
      ["f6", "g8"],
      ["g1", "f3"],
      ["g8", "f6"],
      ["f3", "g1"],
      ["f6", "g8"],
    ];

    for (const [from, to] of sequence) {
      expect(game.moveByAlgebraic(from, to)).toBe(true);
    }

    expect(game.claimDraw("threefold-repetition")).toBe(true);
    expect(game.getStatus().result?.reason).toBe("threefold-repetition");
    expect(game.moveByAlgebraic("b1", "c3")).toBe(false);
  });

  it("offers a draw claim on the fifty-move rule without ending the game", () => {
    const game = new ChessGame(
      createState(
        {
          e1: piece("w", "k"),
          e8: piece("b", "k"),
          a1: piece("w", "r"),
        },
        {
          halfmoveClock: 99,
          sideToMove: "w",
        },
      ),
    );

    expect(game.moveByAlgebraic("a1", "a2")).toBe(true);
    const status = game.getStatus();
    expect(status.result).toBeNull();
    expect(status.claimableDraws).toContain("fifty-move-rule");
    expect(game.claimDraw("fifty-move-rule")).toBe(true);
    expect(game.getStatus().result?.reason).toBe("fifty-move-rule");
  });

  it("detects fivefold repetition automatically", () => {
    const game = new ChessGame();
    const cycle: Array<[string, string]> = [
      ["g1", "f3"],
      ["g8", "f6"],
      ["f3", "g1"],
      ["f6", "g8"],
    ];

    for (let i = 0; i < 4; i += 1) {
      for (const [from, to] of cycle) {
        expect(game.moveByAlgebraic(from, to)).toBe(true);
      }
    }

    expect(game.getStatus().result?.reason).toBe("fivefold-repetition");
  });

  it("detects the seventy-five-move rule automatically", () => {
    const game = new ChessGame(
      createState(
        {
          e1: piece("w", "k"),
          e8: piece("b", "k"),
          a1: piece("w", "r"),
        },
        {
          halfmoveClock: 149,
          sideToMove: "w",
        },
      ),
    );

    expect(game.moveByAlgebraic("a1", "a2")).toBe(true);
    expect(game.getStatus().result?.reason).toBe("seventy-five-move-rule");
  });

  it("detects insufficient material", () => {
    const game = new ChessGame(
      createState({
        e1: piece("w", "k"),
        e8: piece("b", "k"),
      }),
    );

    expect(game.getStatus().result?.reason).toBe("insufficient-material");
  });

  it("includes the en passant target square in FEN after a double pawn push", () => {
    const game = new ChessGame();

    expect(game.moveByAlgebraic("a2", "a4")).toBe(true);
    expect(game.toFen()).toBe("rnbqkbnr/pppppppp/8/8/P7/8/1PPPPPPP/RNBQKBNR b KQkq a3 0 1");
    expect(game.getMoveHistory()[0]?.resultingFen).toBe(
      "rnbqkbnr/pppppppp/8/8/P7/8/1PPPPPPP/RNBQKBNR b KQkq a3 0 1",
    );
  });
});
