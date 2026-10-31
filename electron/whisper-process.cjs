// A single cached model process. Cancellation destroys the process, not just its result.
function createWhisperProcess({ fork, workerPath, cacheDirectory, timeoutMs = 180_000 }) {
  let worker = null;
  let job = null;
  let nextId = 0;
  let disposed = false;

  function finish(active, error, text) {
    if (job !== active) return;
    job = null;
    clearTimeout(active.timer);
    active.signal?.removeEventListener("abort", active.abort);
    if (error) active.reject(error);
    else active.resolve(text);
  }

  function terminate(record) {
    if (!record || record.stopping) return;
    record.stopping = true;
    if (worker === record) worker = null;
    // A cancelled launch must also be killed once its PID becomes available.
    if (record.spawned) record.child.kill();
  }

  function launch() {
    const record = { child: fork(workerPath, [cacheDirectory], { serviceName: "Szeptucha Whisper", stdio: "ignore" }), spawned: false, stopping: false };
    worker = record;
    record.child.once("spawn", () => {
      record.spawned = true;
      if (record.stopping) record.child.kill();
      else if (job?.worker === record) send(job);
    });
    record.child.on("message", message => {
      if (worker !== record || record.stopping) return;
      if (message?.type === "fatal") {
        const active = job;
        terminate(record);
        if (active?.worker === record) finish(active, new Error(`LOCAL_MODEL_ERROR: ${message.error}`));
        return;
      }
      const active = job;
      if (!active || active.worker !== record || message?.id !== active.id) return;
      if (message.type === "progress") {
        const phase = message.phase;
        if (!["loading-model", "transcribing"].includes(phase)) return;
        const downloadProgress = Number.isFinite(message.downloadProgress)
          ? Math.max(0, Math.min(100, message.downloadProgress)) : null;
        active.onProgress?.({ phase, downloadProgress });
      } else if (message.type === "result") {
        if (typeof message.text !== "string" || !message.text.trim()) {
          finish(active, new Error("LOCAL_MODEL_ERROR: Empty transcription"));
        } else finish(active, null, message.text);
      } else if (message.type === "error") {
        terminate(record);
        finish(active, new Error(`LOCAL_MODEL_ERROR: ${message.error}`));
      }
    });
    record.child.once("exit", code => {
      if (worker === record) worker = null;
      if (job?.worker === record) finish(job, new Error(`LOCAL_MODEL_ERROR: Whisper process exited (${code})`));
    });
    return record;
  }

  function send(active) {
    try {
      active.worker.child.postMessage({ type: "transcribe", id: active.id, samples: active.samples, settings: active.settings });
      active.samples = null;
    } catch (error) {
      terminate(active.worker);
      finish(active, error);
    }
  }

  return {
    transcribe(samples, settings, { signal, onProgress } = {}) {
      if (disposed) return Promise.reject(new Error("LOCAL_MODEL_ERROR: Service closed"));
      if (signal?.aborted) return Promise.reject(signal.reason);
      if (job) return Promise.reject(new Error("LOCAL_MODEL_ERROR: Transcription already running"));
      return new Promise((resolve, reject) => {
        let record;
        try { record = worker || launch(); }
        catch (error) { reject(error); return; }
        const active = { id: ++nextId, worker: record, samples, settings, signal, onProgress, resolve, reject };
        job = active;
        active.abort = () => {
          terminate(record);
          finish(active, signal?.reason || new Error("TRANSCRIPTION_CANCELLED"));
        };
        signal?.addEventListener("abort", active.abort, { once: true });
        active.timer = setTimeout(() => {
          terminate(record);
          finish(active, new Error("TRANSCRIPTION_TIMEOUT"));
        }, timeoutMs);
        if (signal?.aborted) active.abort();
        else if (record.spawned) send(active);
      });
    },
    dispose() {
      disposed = true;
      terminate(worker);
      if (job) finish(job, new Error("TRANSCRIPTION_CANCELLED"));
    },
  };
}

module.exports = { createWhisperProcess };
