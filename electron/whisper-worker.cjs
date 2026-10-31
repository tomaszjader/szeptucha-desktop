// Runs in Electron's utility process so ONNX computation can be terminated.
const { createWhisperEngine } = require("./whisper-engine.cjs");
const runtime = import("@huggingface/transformers").then(({ pipeline, env }) => {
  env.cacheDir = process.argv[2];
  process.parentPort.postMessage({ type: "ready" });
  return createWhisperEngine(pipeline);
});
runtime.catch(error => {
  process.parentPort.postMessage({ type: "fatal", error: error.message });
});

let running = false;
process.parentPort.on("message", async ({ data }) => {
  if (data?.type !== "transcribe" || running) return;
  running = true;
  try {
    if (!(data.samples instanceof Float32Array) || !data.samples.length) throw new Error("Invalid audio samples");
    const transcribe = await runtime;
    const text = await transcribe(data.samples, data.settings || {}, patch => {
      process.parentPort.postMessage({ type: "progress", id: data.id, ...patch });
    });
    process.parentPort.postMessage({ type: "result", id: data.id, text });
  } catch (error) {
    process.parentPort.postMessage({ type: "error", id: data.id, error: error.message });
  } finally {
    running = false;
  }
});
