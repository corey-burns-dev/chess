export function createStockfishWorker(): Worker {
  const origin = globalThis.location.origin;
  // Use a full URL for the script and the WASM to ensure Emscripten correctly resolves paths.
  const scriptUrl = `${origin}/engine/engine.js`;
  const wasmUrl = `${origin}/engine/engine.wasm`;

  // Format: script.js#wasm_url,worker
  const workerUrl = `${scriptUrl}#${wasmUrl},worker`;

  console.log("Creating Stockfish worker at:", workerUrl);

  return new Worker(workerUrl);
}
