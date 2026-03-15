export function createStockfishWorker(): Worker {
  const origin = globalThis.location.origin;
  const scriptUrl = `${origin}/engine/engine.js`;

  // Using a relative filename in the hash: #engine.wasm,worker
  // The stockfish.js internal locateFile logic will prepend the script's directory.
  const workerUrl = `${scriptUrl}#engine.wasm,worker`;

  console.log("Creating Stockfish worker at:", workerUrl);

  return new Worker(workerUrl);
}
