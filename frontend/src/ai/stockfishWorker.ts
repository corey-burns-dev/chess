export function createStockfishWorker(): Worker {
  // We use an absolute URL to ensure the browser finds the file correctly
  // and Emscripten can resolve the .wasm asset in the same folder.
  const origin = globalThis.location.origin;
  const scriptUrl = `${origin}/engine/engine.js`;
  const wasmUrl = `${origin}/engine/engine.wasm`;

  // The hash format #<wasm_url>,worker is a known Emscripten/Stockfish pattern
  // to force the script to load the WASM from a specific location and enter worker mode.
  const workerUrl = `${scriptUrl}#${encodeURIComponent(wasmUrl)},worker`;

  console.log("Creating Stockfish worker at:", workerUrl);

  return new Worker(workerUrl);
}
