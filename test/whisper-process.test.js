const { test } = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { createWhisperProcess } = require("../electron/whisper-process.cjs");
const { createWhisperEngine } = require("../electron/whisper-engine.cjs");

function harness(options = {}) {
  const children = [];
  const service = createWhisperProcess({
    workerPath: "worker.cjs", cacheDirectory: "cache", ...options,
    fork: () => {
      const child = new EventEmitter();
      child.messages = [];
      child.kills = 0;
      child.postMessage = message => child.messages.push(message);
      child.kill = () => { child.kills++; return true; };
      children.push(child);
      return child;
    },
  });
  return { service, children };
}
const samples = () => new Float32Array([0, 0.25]);

test("forwards progress and reuses the model process after a successful transcription", async () => {
  const { service, children } = harness();
  const progress = [];
  const request = service.transcribe(samples(), { language: "pl" }, { onProgress: patch => progress.push(patch) });
  const child = children[0];
  assert.equal(child.messages.length, 0);
  child.emit("spawn");
  const first = child.messages[0];
  assert.ok(first.samples instanceof Float32Array);
  child.emit("message", { type: "progress", id: first.id, phase: "loading-model", downloadProgress: 45 });
  child.emit("message", { type: "result", id: first.id, text: "words" });
  assert.equal(await request, "words");
  assert.deepEqual(progress, [{ phase: "loading-model", downloadProgress: 45 }]);
  const next = service.transcribe(samples(), {});
  assert.equal(children.length, 1);
  child.emit("message", { type: "result", id: child.messages[1].id, text: "next" });
  assert.equal(await next, "next");
  service.dispose();
  assert.equal(child.kills, 1);
});

test("cancellation kills the active process and retry ignores old messages and exit", async () => {
  const { service, children } = harness();
  const controller = new AbortController();
  const first = service.transcribe(samples(), {}, { signal: controller.signal });
  const old = children[0]; old.emit("spawn");
  controller.abort(new Error("TRANSCRIPTION_CANCELLED"));
  await assert.rejects(first, /TRANSCRIPTION_CANCELLED/);
  assert.equal(old.kills, 1);
  const next = service.transcribe(samples(), {});
  const child = children[1]; child.emit("spawn");
  old.emit("message", { type: "result", id: old.messages[0].id, text: "stale" });
  old.emit("exit", 1);
  child.emit("message", { type: "result", id: child.messages[0].id, text: "retried" });
  assert.equal(await next, "retried");
  service.dispose();
});

test("cancelling before spawn still terminates the child as soon as it launches", async () => {
  const { service, children } = harness();
  const controller = new AbortController();
  const request = service.transcribe(samples(), {}, { signal: controller.signal });
  controller.abort(new Error("TRANSCRIPTION_CANCELLED"));
  await assert.rejects(request, /TRANSCRIPTION_CANCELLED/);
  children[0].emit("spawn");
  assert.equal(children[0].kills, 1);
  assert.equal(children[0].messages.length, 0);
  service.dispose();
});

test("deadline terminates an unresponsive process", async () => {
  const { service, children } = harness({ timeoutMs: 10 });
  const request = service.transcribe(samples(), {});
  children[0].emit("spawn");
  await assert.rejects(request, /TRANSCRIPTION_TIMEOUT/);
  assert.equal(children[0].kills, 1);
  service.dispose();
});

test("worker crashes and model errors allow a clean restart", async () => {
  const { service, children } = harness();
  const first = service.transcribe(samples(), {});
  children[0].emit("exit", 1);
  await assert.rejects(first, /Whisper process exited/);
  const next = service.transcribe(samples(), {});
  children[1].emit("spawn");
  children[1].emit("message", { type: "error", id: children[1].messages[0].id, error: "model failed" });
  await assert.rejects(next, /LOCAL_MODEL_ERROR: model failed/);
  assert.equal(children[1].kills, 1);
  service.dispose();
});

test("pre-aborted and overlapping jobs do not spawn extra processes; dispose kills a running one", async () => {
  const { service, children } = harness();
  const controller = new AbortController(); controller.abort(new Error("cancelled"));
  await assert.rejects(service.transcribe(samples(), {}, { signal: controller.signal }), /cancelled/);
  assert.equal(children.length, 0);
  const first = service.transcribe(samples(), {}); children[0].emit("spawn");
  await assert.rejects(service.transcribe(samples(), {}), /already running/);
  assert.equal(children.length, 1);
  service.dispose();
  await assert.rejects(first, /TRANSCRIPTION_CANCELLED/);
  assert.equal(children[0].kills, 1);
  await assert.rejects(service.transcribe(samples(), {}), /Service closed/);
});

test("engine caches a model and disposes it when changing models", async () => {
  const loads = [];
  const calls = [];
  let disposed = 0;
  const engine = createWhisperEngine(async (task, model, options) => {
    loads.push({ task, model, options });
    const transcriber = async (audio, opts) => { calls.push({ audio, opts }); return { text: "recognized" }; };
    transcriber.dispose = async () => { disposed++; };
    return transcriber;
  });
  const progress = [];
  await engine(samples(), { whisperModel: "whisper-tiny", language: "pl" }, patch => progress.push(patch));
  await engine(samples(), { whisperModel: "whisper-tiny", language: "auto" }, () => {});
  assert.equal(loads.length, 1);
  assert.equal(calls[0].opts.language, "pl");
  assert.equal(calls[1].opts.language, null);
  assert.equal(loads[0].options.device, "cpu");
  await engine(samples(), { whisperModel: "whisper-base" }, () => {});
  assert.equal(disposed, 1);
  assert.equal(loads[1].model, "onnx-community/whisper-base");
  assert.deepEqual(progress.map(x => x.phase), ["loading-model", "transcribing"]);
});
