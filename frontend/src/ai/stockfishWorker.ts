export function createStockfishWorker(): Worker {
  // Use a relative path from the app root for the engine script.
  const scriptPath = "/engine/engine.js";
  const wasmPath = `${globalThis.location.origin}/engine/engine.wasm`;

  // Stockfish 18 uses the hash for WASM location in worker mode.
  // Using an absolute URL for the WASM part in the hash ensures the worker finds it.
  const workerUrl = `${scriptPath}#${encodeURIComponent(wasmPath)},worker`;

  return new Worker(workerUrl);
}
