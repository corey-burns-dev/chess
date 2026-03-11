import { AI_DIFFICULTY_SETTINGS } from "./config";
import { createStockfishWorker } from "./stockfishWorker";
import { parseBestMove } from "./uci";
import type { AIDifficulty } from "./config";

const READY_TIMEOUT_MS = 10000;

interface PendingReady {
  resolve: () => void;
  reject: (reason?: unknown) => void;
}

interface PendingSearch {
  resolve: (bestMove: string | null) => void;
  reject: (reason?: unknown) => void;
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Stockfish failed to initialize.";
}

export class StockfishManager {
  private worker: Worker | null = null;
  private readyPromise: Promise<void> | null = null;
  private readyWaiters: PendingReady[] = [];
  private pendingSearch: PendingSearch | null = null;
  private startupResolved = false;
  private startupMessages: string[] = [];

  async ensureReady(): Promise<void> {
    if (this.readyPromise) {
      return this.readyPromise;
    }

    this.worker = createStockfishWorker();
    this.startupMessages = [];
    this.readyPromise = new Promise<void>((resolve, reject) => {
      const readyTimeout = window.setTimeout(() => {
        const details =
          this.startupMessages.length > 0
            ? ` Last output: ${this.startupMessages.join(" | ")}`
            : "";
        const error = new Error(`Stockfish did not finish loading.${details}`);
        this.failOutstanding(error);
        reject(error);
      }, READY_TIMEOUT_MS);

      const handleWorkerError = (event: ErrorEvent) => {
        const details =
          this.startupMessages.length > 0
            ? ` Last output: ${this.startupMessages.join(" | ")}`
            : "";
        const error = new Error(`${event.message || "Stockfish worker failed."}${details}`);
        window.clearTimeout(readyTimeout);
        this.failOutstanding(error);
        reject(error);
      };

      this.worker?.addEventListener("error", handleWorkerError, { once: true });
      this.worker?.addEventListener("message", this.handleWorkerMessage);

      this.readyWaiters.push({
        resolve: () => {
          window.clearTimeout(readyTimeout);
          resolve();
        },
        reject: (reason) => {
          window.clearTimeout(readyTimeout);
          reject(reason);
        },
      });

      this.send("uci");
    }).catch((error) => {
      this.dispose();
      throw error;
    });

    return this.readyPromise;
  }

  async newGame(): Promise<void> {
    await this.ensureReady();
    this.send("ucinewgame");
    await this.waitUntilReady();
  }

  async getBestMove(fen: string, difficulty: AIDifficulty): Promise<string | null> {
    await this.ensureReady();

    if (this.pendingSearch) {
      this.stopSearch("Search superseded by a new request.");
    }

    const settings = AI_DIFFICULTY_SETTINGS[difficulty];
    this.send(`setoption name Skill Level value ${settings.skillLevel}`);
    this.send(`position fen ${fen}`);

    return new Promise<string | null>((resolve, reject) => {
      this.pendingSearch = { resolve, reject };
      this.send(`go movetime ${settings.movetimeMs}`);
    });
  }

  stopSearch(reason = "Search canceled."): void {
    const pendingSearch = this.pendingSearch;
    if (!pendingSearch) {
      return;
    }

    this.pendingSearch = null;
    this.send("stop");
    pendingSearch.reject(new Error(reason));
  }

  dispose(): void {
    this.stopSearch("Engine disposed.");

    for (const waiter of this.readyWaiters) {
      waiter.reject(new Error("Engine disposed."));
    }
    this.readyWaiters = [];

    if (this.worker) {
      try {
        this.send("quit");
      } catch {
        // Worker may already be gone.
      }

      this.worker.removeEventListener("message", this.handleWorkerMessage);
      this.worker.terminate();
    }

    this.worker = null;
    this.readyPromise = null;
    this.startupResolved = false;
  }

  private async waitUntilReady(): Promise<void> {
    await this.ensureReady();

    return new Promise<void>((resolve, reject) => {
      this.readyWaiters.push({ resolve, reject });
      this.send("isready");
    });
  }

  private readonly handleWorkerMessage = (event: MessageEvent<string>) => {
    const payload = String(event.data ?? "");
    const lines = payload
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);

    for (const line of lines) {
      if (!this.startupResolved) {
        this.startupMessages.push(line);
        if (this.startupMessages.length > 8) {
          this.startupMessages.shift();
        }
      }

      if (line === "uciok") {
        this.send("isready");
        continue;
      }

      if (line === "readyok") {
        const nextWaiter = this.readyWaiters.shift();
        if (nextWaiter) {
          this.startupResolved = true;
          nextWaiter.resolve();
        }
        continue;
      }

      if (!this.startupResolved) {
        continue;
      }

      if (line.startsWith("bestmove ")) {
        const pendingSearch = this.pendingSearch;
        if (!pendingSearch) {
          continue;
        }

        this.pendingSearch = null;
        pendingSearch.resolve(parseBestMove(line));
      }
    }
  };

  private send(command: string): void {
    if (!this.worker) {
      throw new Error("Stockfish worker is not available.");
    }

    this.worker.postMessage(command);
  }

  private failOutstanding(error: unknown): void {
    const failure = new Error(toErrorMessage(error));

    if (this.pendingSearch) {
      const pendingSearch = this.pendingSearch;
      this.pendingSearch = null;
      pendingSearch.reject(failure);
    }

    for (const waiter of this.readyWaiters) {
      waiter.reject(failure);
    }
    this.readyWaiters = [];
  }
}
