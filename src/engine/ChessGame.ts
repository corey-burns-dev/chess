import {
  PIECE_LETTERS,
  algebraicToIndex,
  cloneState,
  createEmptyBoard,
  createInitialState,
  getFile,
  getRankIndex,
  indexToAlgebraic,
  isLightSquare,
  isOnBoard,
  oppositeColor,
} from "./board";
import type {
  Board,
  ChessState,
  Color,
  DrawClaimReason,
  GameResult,
  GameStatus,
  HistoryEntry,
  Move,
  MoveRecord,
  Piece,
  PieceType,
} from "./types";

const KNIGHT_DELTAS = [
  [-2, -1],
  [-2, 1],
  [-1, -2],
  [-1, 2],
  [1, -2],
  [1, 2],
  [2, -1],
  [2, 1],
] as const;

const KING_DELTAS = [
  [-1, -1],
  [-1, 0],
  [-1, 1],
  [0, -1],
  [0, 1],
  [1, -1],
  [1, 0],
  [1, 1],
] as const;

const BISHOP_DIRECTIONS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;

const ROOK_DIRECTIONS = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1],
] as const;

const QUEEN_DIRECTIONS = [...BISHOP_DIRECTIONS, ...ROOK_DIRECTIONS] as const;
const PROMOTION_TYPES: PieceType[] = ["q", "r", "b", "n"];

function cloneMove(move: Move): Move {
  return {
    ...move,
    piece: { ...move.piece },
    captured: move.captured ? { ...move.captured } : undefined,
  };
}

function cloneStatus(status: GameStatus): GameStatus {
  return {
    inCheck: status.inCheck,
    legalMoves: status.legalMoves.map((move) => cloneMove(move)),
    claimableDraws: [...status.claimableDraws],
    result: status.result ? { ...status.result } : null,
  };
}

function pieceToFen(piece: Piece): string {
  const char = piece.type;
  return piece.color === "w" ? char.toUpperCase() : char;
}

function squareFromRowCol(row: number, col: number): number {
  return row * 8 + col;
}

function buildDrawResult(reason: Exclude<GameResult["reason"], "checkmate">): GameResult {
  switch (reason) {
    case "stalemate":
      return { winner: null, reason, message: "Draw by stalemate." };
    case "threefold-repetition":
      return { winner: null, reason, message: "Draw claimed by threefold repetition." };
    case "fifty-move-rule":
      return { winner: null, reason, message: "Draw claimed by fifty-move rule." };
    case "fivefold-repetition":
      return { winner: null, reason, message: "Draw by fivefold repetition." };
    case "seventy-five-move-rule":
      return { winner: null, reason, message: "Draw by seventy-five-move rule." };
    case "insufficient-material":
      return { winner: null, reason, message: "Draw by insufficient material." };
  }
}

export class ChessGame {
  private state: ChessState;
  private status: GameStatus;
  private history: HistoryEntry[];
  private positionCounts: Map<string, number>;

  constructor(initialState?: ChessState) {
    this.state = cloneState(initialState ?? createInitialState());
    this.history = [];
    this.positionCounts = new Map();
    const initialKey = this.getPositionKey(this.state);
    this.positionCounts.set(initialKey, 1);
    this.status = this.evaluateState(this.state, this.positionCounts);
  }

  reset(): void {
    this.state = createInitialState();
    this.history = [];
    this.positionCounts = new Map();
    const initialKey = this.getPositionKey(this.state);
    this.positionCounts.set(initialKey, 1);
    this.status = this.evaluateState(this.state, this.positionCounts);
  }

  getState(): ChessState {
    return cloneState(this.state);
  }

  getStatus(): GameStatus {
    return cloneStatus(this.status);
  }

  getMoveHistory(): MoveRecord[] {
    return this.history.map((entry) => ({
      move: cloneMove(entry.record.move),
      san: entry.record.san,
      resultingFen: entry.record.resultingFen,
    }));
  }

  getLegalMoves(): Move[] {
    return this.status.legalMoves.map((move) => cloneMove(move));
  }

  getLegalMovesFrom(square: number): Move[] {
    return this.status.legalMoves
      .filter((move) => move.from === square)
      .map((move) => cloneMove(move));
  }

  getClaimableDraws(): DrawClaimReason[] {
    return [...this.status.claimableDraws];
  }

  getPiece(square: number): Piece | null {
    const piece = this.state.board[square];
    return piece ? { ...piece } : null;
  }

  claimDraw(reason?: DrawClaimReason): boolean {
    if (this.status.result) {
      return false;
    }

    const chosenReason = reason ?? this.status.claimableDraws[0];
    if (!chosenReason || !this.status.claimableDraws.includes(chosenReason)) {
      return false;
    }

    this.status = {
      ...cloneStatus(this.status),
      result: buildDrawResult(chosenReason),
    };
    return true;
  }

  moveByAlgebraic(from: string, to: string, promotion?: PieceType): boolean {
    return this.move(algebraicToIndex(from), algebraicToIndex(to), promotion);
  }

  move(from: number, to: number, promotion?: PieceType): boolean {
    if (this.status.result) {
      return false;
    }

    const matchingMoves = this.status.legalMoves.filter((move) => {
      if (move.from !== from || move.to !== to) {
        return false;
      }

      if (move.promotion) {
        return move.promotion === promotion;
      }

      return promotion === undefined;
    });

    if (matchingMoves.length !== 1) {
      return false;
    }

    const chosenMove = matchingMoves[0];
    const previousState = cloneState(this.state);
    const previousPositionCounts = new Map(this.positionCounts);
    const previousStatus = cloneStatus(this.status);
    const nextState = this.applyMoveToState(this.state, chosenMove);
    const nextPositionCounts = new Map(this.positionCounts);
    const nextKey = this.getPositionKey(nextState);
    nextPositionCounts.set(nextKey, (nextPositionCounts.get(nextKey) ?? 0) + 1);
    const nextStatus = this.evaluateState(nextState, nextPositionCounts);
    const san = this.buildSan(this.state, chosenMove, this.status.legalMoves, nextStatus);
    const recordedMove = cloneMove({ ...chosenMove, san });
    nextState.lastMove = cloneMove(recordedMove);

    const record: MoveRecord = {
      move: recordedMove,
      san,
      resultingFen: this.toFen(nextState),
    };

    this.state = nextState;
    this.positionCounts = nextPositionCounts;
    this.status = nextStatus;
    this.history.push({ previousState, previousPositionCounts, previousStatus, record });
    return true;
  }

  undo(): boolean {
    const lastEntry = this.history.pop();

    if (!lastEntry) {
      return false;
    }

    this.state = cloneState(lastEntry.previousState);
    this.positionCounts = new Map(lastEntry.previousPositionCounts);
    this.status = cloneStatus(lastEntry.previousStatus);
    return true;
  }

  toFen(state: ChessState = this.state): string {
    const rows: string[] = [];

    for (let rank = 0; rank < 8; rank += 1) {
      let row = "";
      let emptyCount = 0;

      for (let file = 0; file < 8; file += 1) {
        const piece = state.board[rank * 8 + file];
        if (!piece) {
          emptyCount += 1;
          continue;
        }

        if (emptyCount > 0) {
          row += String(emptyCount);
          emptyCount = 0;
        }

        row += pieceToFen(piece);
      }

      if (emptyCount > 0) {
        row += String(emptyCount);
      }

      rows.push(row);
    }

    const castling = this.castlingRightsToString(state);
    const enPassant = this.getFenEnPassantTarget(state);
    return `${rows.join("/")} ${state.sideToMove} ${castling} ${enPassant} ${state.halfmoveClock} ${state.fullmoveNumber}`;
  }

  private castlingRightsToString(state: ChessState): string {
    let result = "";
    if (state.castlingRights.w.kingside) {
      result += "K";
    }
    if (state.castlingRights.w.queenside) {
      result += "Q";
    }
    if (state.castlingRights.b.kingside) {
      result += "k";
    }
    if (state.castlingRights.b.queenside) {
      result += "q";
    }
    return result || "-";
  }

  private getPositionKey(state: ChessState): string {
    const boardPart = this.toFen(state).split(" ").slice(0, 1)[0];
    return [
      boardPart,
      state.sideToMove,
      this.castlingRightsToString(state),
      this.getEnPassantKey(state),
    ].join(" ");
  }

  private getFenEnPassantTarget(state: ChessState): string {
    return state.enPassantTarget === null ? "-" : indexToAlgebraic(state.enPassantTarget);
  }

  private getEnPassantKey(state: ChessState): string {
    if (state.enPassantTarget === null) {
      return "-";
    }

    // Repetition compares positions by legal move availability, so the en passant
    // file only matters when the side to move can actually capture on that square.
    const capturingMoves = this.getLegalMovesForState(state).filter((move) => move.isEnPassant);
    if (capturingMoves.length === 0) {
      return "-";
    }

    return indexToAlgebraic(state.enPassantTarget);
  }

  private evaluateState(state: ChessState, positionCounts: Map<string, number>): GameStatus {
    const legalMoves = this.getLegalMovesForState(state);
    const kingSquare = this.findKingSquare(state.board, state.sideToMove);
    const inCheck =
      kingSquare >= 0 &&
      this.isSquareAttacked(state.board, kingSquare, oppositeColor(state.sideToMove));
    const repetitionCount = positionCounts.get(this.getPositionKey(state)) ?? 0;
    const claimableDraws: DrawClaimReason[] = [];
    if (state.halfmoveClock >= 100) {
      claimableDraws.push("fifty-move-rule");
    }
    if (repetitionCount >= 3) {
      claimableDraws.push("threefold-repetition");
    }

    let result: GameResult | null = null;

    if (legalMoves.length === 0) {
      result = inCheck
        ? {
            winner: oppositeColor(state.sideToMove),
            reason: "checkmate",
            message: `${oppositeColor(state.sideToMove) === "w" ? "White" : "Black"} wins by checkmate.`,
          }
        : buildDrawResult("stalemate");
    } else if (state.halfmoveClock >= 150) {
      result = buildDrawResult("seventy-five-move-rule");
    } else if (repetitionCount >= 5) {
      result = buildDrawResult("fivefold-repetition");
    } else if (this.hasInsufficientMaterial(state.board)) {
      result = buildDrawResult("insufficient-material");
    }

    return { inCheck, legalMoves, claimableDraws: result ? [] : claimableDraws, result };
  }

  private hasInsufficientMaterial(board: Board): boolean {
    const whiteMinors: Array<{ piece: Piece; square: number }> = [];
    const blackMinors: Array<{ piece: Piece; square: number }> = [];

    for (let square = 0; square < 64; square += 1) {
      const piece = board[square];
      if (!piece || piece.type === "k") {
        continue;
      }

      if (piece.type === "p" || piece.type === "r" || piece.type === "q") {
        return false;
      }

      if (piece.color === "w") {
        whiteMinors.push({ piece, square });
      } else {
        blackMinors.push({ piece, square });
      }
    }

    const totalMinorCount = whiteMinors.length + blackMinors.length;
    if (totalMinorCount === 0) {
      return true;
    }

    if (totalMinorCount === 1) {
      return true;
    }

    if (totalMinorCount === 2) {
      const allMinors = [...whiteMinors, ...blackMinors];
      const bishopCount = allMinors.filter(({ piece }) => piece.type === "b").length;
      const knightCount = allMinors.filter(({ piece }) => piece.type === "n").length;

      if (knightCount === 2) {
        return whiteMinors.length === 2 || blackMinors.length === 2;
      }

      if (bishopCount === 2) {
        const [first, second] = allMinors;
        return isLightSquare(first.square) === isLightSquare(second.square);
      }
    }

    return false;
  }

  private buildSan(
    beforeState: ChessState,
    move: Move,
    legalMovesBefore: Move[],
    nextStatus: GameStatus,
  ): string {
    let san = "";

    if (move.isCastling === "kingside") {
      san = "O-O";
    } else if (move.isCastling === "queenside") {
      san = "O-O-O";
    } else {
      const pieceLetter = PIECE_LETTERS[move.piece.type];
      const isCapture = Boolean(move.captured) || move.isEnPassant;

      if (move.piece.type === "p") {
        if (isCapture) {
          san += indexToAlgebraic(move.from)[0];
        }
      } else {
        san += pieceLetter;
        const ambiguousMoves = legalMovesBefore.filter(
          (candidate) =>
            candidate.to === move.to &&
            candidate.from !== move.from &&
            candidate.piece.color === move.piece.color &&
            candidate.piece.type === move.piece.type,
        );

        if (ambiguousMoves.length > 0) {
          const sameFile = ambiguousMoves.some(
            (candidate) => getFile(candidate.from) === getFile(move.from),
          );
          const sameRank = ambiguousMoves.some(
            (candidate) => getRankIndex(candidate.from) === getRankIndex(move.from),
          );

          if (!sameFile) {
            san += indexToAlgebraic(move.from)[0];
          } else if (!sameRank) {
            san += indexToAlgebraic(move.from)[1];
          } else {
            san += indexToAlgebraic(move.from);
          }
        }
      }

      if (isCapture) {
        san += "x";
      }

      san += indexToAlgebraic(move.to);

      if (move.promotion) {
        san += `=${PIECE_LETTERS[move.promotion]}`;
      }
    }

    if (nextStatus.inCheck) {
      san += nextStatus.legalMoves.length === 0 ? "#" : "+";
    }

    return san;
  }

  private getLegalMovesForState(state: ChessState): Move[] {
    const moves: Move[] = [];

    for (let square = 0; square < 64; square += 1) {
      const piece = state.board[square];
      if (!piece || piece.color !== state.sideToMove) {
        continue;
      }

      const pseudoMoves = this.getPseudoLegalMovesForPiece(state, square, piece);
      for (const move of pseudoMoves) {
        const nextState = this.applyMoveToState(state, move);
        const kingSquare = this.findKingSquare(nextState.board, piece.color);
        if (kingSquare < 0) {
          continue;
        }
        // Legal moves are derived by simulating each candidate and rejecting any
        // line that leaves the moving side's king attacked in the resulting board.
        if (!this.isSquareAttacked(nextState.board, kingSquare, oppositeColor(piece.color))) {
          moves.push(move);
        }
      }
    }

    return moves;
  }

  private getPseudoLegalMovesForPiece(state: ChessState, square: number, piece: Piece): Move[] {
    const moves: Move[] = [];
    const row = getRankIndex(square);
    const col = getFile(square);

    if (piece.type === "p") {
      const forward = piece.color === "w" ? -8 : 8;
      const startRow = piece.color === "w" ? 6 : 1;
      const promotionRow = piece.color === "w" ? 0 : 7;
      const oneStep = square + forward;

      if (isOnBoard(oneStep) && !state.board[oneStep]) {
        if (getRankIndex(oneStep) === promotionRow) {
          // Promotion is modeled as four distinct legal moves so the UI can require
          // an explicit piece choice and the engine can validate that exact choice.
          for (const promotion of PROMOTION_TYPES) {
            moves.push({ from: square, to: oneStep, piece: { ...piece }, promotion });
          }
        } else {
          moves.push({ from: square, to: oneStep, piece: { ...piece } });
        }

        const twoStep = square + forward * 2;
        if (row === startRow && !state.board[twoStep]) {
          moves.push({
            from: square,
            to: twoStep,
            piece: { ...piece },
            isDoublePawnPush: true,
          });
        }
      }

      for (const fileOffset of [-1, 1]) {
        const targetCol = col + fileOffset;
        const targetRow = row + (piece.color === "w" ? -1 : 1);
        if (targetCol < 0 || targetCol > 7 || targetRow < 0 || targetRow > 7) {
          continue;
        }

        const targetSquare = squareFromRowCol(targetRow, targetCol);
        const occupant = state.board[targetSquare];
        if (occupant && occupant.color !== piece.color) {
          if (targetRow === promotionRow) {
            for (const promotion of PROMOTION_TYPES) {
              moves.push({
                from: square,
                to: targetSquare,
                piece: { ...piece },
                captured: { ...occupant },
                promotion,
              });
            }
          } else {
            moves.push({
              from: square,
              to: targetSquare,
              piece: { ...piece },
              captured: { ...occupant },
            });
          }
          continue;
        }

        if (state.enPassantTarget === targetSquare) {
          const capturedSquare = targetSquare - forward;
          const capturedPawn = state.board[capturedSquare];
          if (capturedPawn && capturedPawn.color !== piece.color && capturedPawn.type === "p") {
            moves.push({
              from: square,
              to: targetSquare,
              piece: { ...piece },
              captured: { ...capturedPawn },
              isEnPassant: true,
            });
          }
        }
      }

      return moves;
    }

    if (piece.type === "n") {
      for (const [rowDelta, colDelta] of KNIGHT_DELTAS) {
        const targetRow = row + rowDelta;
        const targetCol = col + colDelta;
        if (targetRow < 0 || targetRow > 7 || targetCol < 0 || targetCol > 7) {
          continue;
        }

        const target = squareFromRowCol(targetRow, targetCol);
        const occupant = state.board[target];
        if (!occupant || occupant.color !== piece.color) {
          moves.push({
            from: square,
            to: target,
            piece: { ...piece },
            captured: occupant ? { ...occupant } : undefined,
          });
        }
      }
      return moves;
    }

    if (piece.type === "b" || piece.type === "r" || piece.type === "q") {
      const directions =
        piece.type === "b"
          ? BISHOP_DIRECTIONS
          : piece.type === "r"
            ? ROOK_DIRECTIONS
            : QUEEN_DIRECTIONS;
      for (const [rowDelta, colDelta] of directions) {
        let targetRow = row + rowDelta;
        let targetCol = col + colDelta;

        while (targetRow >= 0 && targetRow <= 7 && targetCol >= 0 && targetCol <= 7) {
          const target = squareFromRowCol(targetRow, targetCol);
          const occupant = state.board[target];
          if (!occupant) {
            moves.push({ from: square, to: target, piece: { ...piece } });
          } else {
            if (occupant.color !== piece.color) {
              moves.push({
                from: square,
                to: target,
                piece: { ...piece },
                captured: { ...occupant },
              });
            }
            break;
          }

          targetRow += rowDelta;
          targetCol += colDelta;
        }
      }
      return moves;
    }

    if (piece.type === "k") {
      for (const [rowDelta, colDelta] of KING_DELTAS) {
        const targetRow = row + rowDelta;
        const targetCol = col + colDelta;
        if (targetRow < 0 || targetRow > 7 || targetCol < 0 || targetCol > 7) {
          continue;
        }

        const target = squareFromRowCol(targetRow, targetCol);
        const occupant = state.board[target];
        if (!occupant || occupant.color !== piece.color) {
          moves.push({
            from: square,
            to: target,
            piece: { ...piece },
            captured: occupant ? { ...occupant } : undefined,
          });
        }
      }

      const homeSquare = piece.color === "w" ? 60 : 4;
      const rookSquares =
        piece.color === "w" ? { kingside: 63, queenside: 56 } : { kingside: 7, queenside: 0 };
      const enemyColor = oppositeColor(piece.color);

      // Castling must be generated explicitly because the king may not start in,
      // pass through, or end in check. A normal king-move legality filter only
      // catches the final square, so the intermediate square is checked here too.
      if (
        square === homeSquare &&
        !this.isSquareAttacked(state.board, square, enemyColor) &&
        state.castlingRights[piece.color].kingside
      ) {
        const rook = state.board[rookSquares.kingside];
        const path = [square + 1, square + 2];
        if (
          rook &&
          rook.color === piece.color &&
          rook.type === "r" &&
          path.every((target) => !state.board[target]) &&
          path.every((target) => !this.isSquareAttacked(state.board, target, enemyColor))
        ) {
          moves.push({
            from: square,
            to: square + 2,
            piece: { ...piece },
            isCastling: "kingside",
          });
        }
      }

      if (
        square === homeSquare &&
        !this.isSquareAttacked(state.board, square, enemyColor) &&
        state.castlingRights[piece.color].queenside
      ) {
        const rook = state.board[rookSquares.queenside];
        const emptySquares = [square - 1, square - 2, square - 3];
        const kingPath = [square - 1, square - 2];
        if (
          rook &&
          rook.color === piece.color &&
          rook.type === "r" &&
          emptySquares.every((target) => !state.board[target]) &&
          kingPath.every((target) => !this.isSquareAttacked(state.board, target, enemyColor))
        ) {
          moves.push({
            from: square,
            to: square - 2,
            piece: { ...piece },
            isCastling: "queenside",
          });
        }
      }
    }

    return moves;
  }

  private applyMoveToState(state: ChessState, move: Move): ChessState {
    const nextState = cloneState(state);
    const movingPiece = { ...move.piece, type: move.promotion ?? move.piece.type };
    const originalPiece = { ...move.piece };
    nextState.enPassantTarget = null;
    nextState.board[move.from] = null;

    let capturedSquare = move.to;
    let capturedPiece = move.captured ? { ...move.captured } : undefined;

    // En passant captures a pawn on the adjacent file instead of the landing square.
    if (move.isEnPassant) {
      const forward = move.piece.color === "w" ? -8 : 8;
      capturedSquare = move.to - forward;
      capturedPiece = nextState.board[capturedSquare]
        ? { ...(nextState.board[capturedSquare] as Piece) }
        : capturedPiece;
      nextState.board[capturedSquare] = null;
    }

    if (capturedPiece && !move.isEnPassant) {
      nextState.board[capturedSquare] = null;
    }

    nextState.board[move.to] = movingPiece;

    if (move.isCastling) {
      const rookFrom = move.isCastling === "kingside" ? move.to + 1 : move.to - 2;
      const rookTo = move.isCastling === "kingside" ? move.to - 1 : move.to + 1;
      const rook = nextState.board[rookFrom];
      nextState.board[rookFrom] = null;
      nextState.board[rookTo] = rook ? { ...rook } : null;
    }

    if (capturedPiece) {
      nextState.capturedPieces[capturedPiece.color].push({ ...capturedPiece });
    }

    if (originalPiece.type === "k") {
      nextState.castlingRights[originalPiece.color].kingside = false;
      nextState.castlingRights[originalPiece.color].queenside = false;
    }

    if (originalPiece.type === "r") {
      this.clearRookCastlingRights(nextState, originalPiece.color, move.from);
    }

    if (capturedPiece?.type === "r") {
      this.clearRookCastlingRights(nextState, capturedPiece.color, capturedSquare);
    }

    if (move.isDoublePawnPush) {
      const forward = move.piece.color === "w" ? -8 : 8;
      nextState.enPassantTarget = move.from + forward;
    }

    nextState.halfmoveClock =
      originalPiece.type === "p" || capturedPiece ? 0 : state.halfmoveClock + 1;
    nextState.fullmoveNumber = state.fullmoveNumber + (state.sideToMove === "b" ? 1 : 0);
    nextState.sideToMove = oppositeColor(state.sideToMove);
    nextState.lastMove = cloneMove(move);
    return nextState;
  }

  private clearRookCastlingRights(state: ChessState, color: Color, square: number): void {
    if (color === "w") {
      if (square === 63) {
        state.castlingRights.w.kingside = false;
      } else if (square === 56) {
        state.castlingRights.w.queenside = false;
      }
      return;
    }

    if (square === 7) {
      state.castlingRights.b.kingside = false;
    } else if (square === 0) {
      state.castlingRights.b.queenside = false;
    }
  }

  private findKingSquare(board: Board, color: Color): number {
    return board.findIndex((piece) => piece?.color === color && piece.type === "k");
  }

  private isSquareAttacked(board: Board, targetSquare: number, attackingColor: Color): boolean {
    const targetRow = getRankIndex(targetSquare);
    const targetCol = getFile(targetSquare);

    // Check detection is centralized here so king safety, castling validation, and
    // check/checkmate evaluation all use the same attack map calculation.
    const pawnRow = targetRow + (attackingColor === "w" ? 1 : -1);
    if (pawnRow >= 0 && pawnRow <= 7) {
      for (const fileDelta of [-1, 1]) {
        const pawnCol = targetCol + fileDelta;
        if (pawnCol < 0 || pawnCol > 7) {
          continue;
        }

        const pawnSquare = squareFromRowCol(pawnRow, pawnCol);
        const piece = board[pawnSquare];
        if (piece && piece.color === attackingColor && piece.type === "p") {
          return true;
        }
      }
    }

    for (const [rowDelta, colDelta] of KNIGHT_DELTAS) {
      const row = targetRow + rowDelta;
      const col = targetCol + colDelta;
      if (row < 0 || row > 7 || col < 0 || col > 7) {
        continue;
      }
      const piece = board[squareFromRowCol(row, col)];
      if (piece && piece.color === attackingColor && piece.type === "n") {
        return true;
      }
    }

    for (const [rowDelta, colDelta] of BISHOP_DIRECTIONS) {
      let row = targetRow + rowDelta;
      let col = targetCol + colDelta;
      while (row >= 0 && row <= 7 && col >= 0 && col <= 7) {
        const piece = board[squareFromRowCol(row, col)];
        if (piece) {
          if (piece.color === attackingColor && (piece.type === "b" || piece.type === "q")) {
            return true;
          }
          break;
        }
        row += rowDelta;
        col += colDelta;
      }
    }

    for (const [rowDelta, colDelta] of ROOK_DIRECTIONS) {
      let row = targetRow + rowDelta;
      let col = targetCol + colDelta;
      while (row >= 0 && row <= 7 && col >= 0 && col <= 7) {
        const piece = board[squareFromRowCol(row, col)];
        if (piece) {
          if (piece.color === attackingColor && (piece.type === "r" || piece.type === "q")) {
            return true;
          }
          break;
        }
        row += rowDelta;
        col += colDelta;
      }
    }

    for (const [rowDelta, colDelta] of KING_DELTAS) {
      const row = targetRow + rowDelta;
      const col = targetCol + colDelta;
      if (row < 0 || row > 7 || col < 0 || col > 7) {
        continue;
      }
      const piece = board[squareFromRowCol(row, col)];
      if (piece && piece.color === attackingColor && piece.type === "k") {
        return true;
      }
    }

    return false;
  }
}

export { createEmptyBoard, createInitialState, indexToAlgebraic, algebraicToIndex };
export type { ChessState, Color, DrawClaimReason, Move, MoveRecord, Piece, PieceType };
