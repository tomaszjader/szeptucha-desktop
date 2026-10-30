// One lifecycle for the button, global shortcut and tray. The preload owns it,
// so hiding the window or switching React tabs cannot interrupt a recording.
function createRecordingController({ getUserMedia, createMediaRecorder, transcribe, complete, onState, onError, now = Date.now, transcriptionTimeoutMs = 180_000 }) {
  let state = { phase: "idle", source: "interface", startedAt: null, durationMs: 0, downloadProgress: null, audioLevel: 0, error: null, canRetry: false };
  let session = null;
  let pending = null;
  const listeners = new Set();
  const snapshot = () => ({ ...state });

  function publish(patch) {
    state = { ...state, ...patch };
    if (Object.keys(patch).some(key => key !== "audioLevel")) onState(snapshot());
    for (const listener of listeners) listener(snapshot());
  }

  function stopLevelMonitor(active) {
    if (active.levelTimer) clearInterval(active.levelTimer);
    active.levelTimer = null;
    try { active.levelSource?.disconnect(); } catch {}
    active.levelSource = null;
    active.levelAnalyser = null;
    if (active.levelContext && active.levelContext.state !== "closed") {
      void active.levelContext.close().catch(() => {});
    }
    active.levelContext = null;
  }

  function startLevelMonitor(active) {
    try {
      const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AudioContextClass) return;
      active.levelContext = new AudioContextClass();
      void active.levelContext.resume().catch(() => {});
      active.levelAnalyser = active.levelContext.createAnalyser();
      active.levelAnalyser.fftSize = 64;
      active.levelAnalyser.smoothingTimeConstant = 0.8;
      active.levelSource = active.levelContext.createMediaStreamSource(active.stream);
      active.levelSource.connect(active.levelAnalyser);
      const data = new Uint8Array(active.levelAnalyser.frequencyBinCount);
      active.levelTimer = setInterval(() => {
        if (session !== active || state.phase !== "recording" || !active.levelAnalyser) return;
        active.levelAnalyser.getByteFrequencyData(data);
        let sum = 0;
        for (const sample of data) sum += sample;
        const average = data.length ? sum / data.length : 0;
        publish({ audioLevel: Math.min(100, Math.round((average / 128) * 100)) });
      }, 80);
    } catch {
      stopLevelMonitor(active);
      publish({ audioLevel: 0 });
    }
  }

  function releaseCapture(active) {
    stopLevelMonitor(active);
    if (active.recorder) {
      active.recorder.ondataavailable = null;
      active.recorder.onstop = null;
      active.recorder.onerror = null;
      if (active.recorder.state !== "inactive") {
        try { active.recorder.stop(); } catch {}
      }
    }
    active.stream?.getTracks().forEach(track => track.stop());
    active.stream = null;
  }

  function fail(active, error) {
    if (session !== active) return;
    releaseCapture(active);
    session = null;
    if (active.blob?.size) pending = active;
    const message = error instanceof Error ? error.message : String(error);
    publish({ phase: "error", downloadProgress: null, audioLevel: 0, error: message, canRetry: Boolean(pending),
      durationMs: state.phase === "recording" ? Math.max(0, now() - state.startedAt) : state.durationMs });
    onError(message);
  }

  async function start(source) {
    if (pending || !["idle", "completed", "error"].includes(state.phase)) return;
    const active = { stream: null, recorder: null, chunks: [], rejectStop: null,
      levelContext: null, levelAnalyser: null, levelSource: null, levelTimer: null };
    session = active;
    publish({ phase: "starting", source, startedAt: null, durationMs: 0, downloadProgress: null, audioLevel: 0, error: null });
    try {
      active.stream = await getUserMedia();
      startLevelMonitor(active);
      active.recorder = createMediaRecorder(active.stream);
      active.recorder.ondataavailable = event => {
        if (event.data.size) active.chunks.push(event.data);
      };
      active.recorder.onerror = event => {
        const error = event.error || new Error("MediaRecorder error");
        active.rejectStop?.(error);
        fail(active, error);
      };
      active.recorder.start();
      publish({ phase: "recording", startedAt: now() });
    } catch (error) {
      fail(active, error);
    }
  }

  async function processRecording(active) {
    const attempt = new AbortController();
    active.attempt = attempt;
    const timeout = setTimeout(() => attempt.abort(new Error("TRANSCRIPTION_TIMEOUT")), transcriptionTimeoutMs);
    let onAbort;
    const interrupted = new Promise((_, reject) => {
      onAbort = () => reject(attempt.signal.reason);
      attempt.signal.addEventListener("abort", onAbort, { once: true });
    });
    try {
      if (!active.hasResult) {
        const result = await Promise.race([transcribe(active.blob, patch => {
          if (session === active && active.attempt === attempt && !attempt.signal.aborted) publish(patch);
        }, attempt.signal), interrupted]);
        attempt.signal.throwIfAborted();
        active.result = result;
        active.hasResult = true;
      }
      attempt.signal.throwIfAborted();
      await complete(active.result);
      if (session === active) {
        pending = null;
        session = null;
        active.blob = null;
        publish({ phase: "completed", downloadProgress: null, audioLevel: 0, error: null, canRetry: false });
      }
      return active.result;
    } catch (error) {
      fail(active, error);
    } finally {
      clearTimeout(timeout);
      attempt.signal.removeEventListener("abort", onAbort);
      if (active.attempt === attempt) active.attempt = null;
    }
  }

  async function retry() {
    if (!pending || session || state.phase !== "error") return;
    const active = pending;
    session = active;
    publish({ phase: "transcribing", error: null, downloadProgress: null, canRetry: true });
    return processRecording(active);
  }

  async function stop() {
    if (state.phase !== "recording" || !session) return;
    const active = session;
    publish({ phase: "transcribing", audioLevel: 0, durationMs: Math.max(0, now() - state.startedAt) });
    try {
      const blob = await new Promise((resolve, reject) => {
        active.rejectStop = reject;
        active.recorder.onstop = () => resolve(new Blob(active.chunks, { type: active.recorder.mimeType }));
        active.recorder.stop();
      });
      active.rejectStop = null;
      releaseCapture(active);
      active.chunks = [];
      active.blob = blob;
      return await processRecording(active);
    } catch (error) {
      fail(active, error);
    } finally {
      releaseCapture(active);
    }
  }

  return {
    getState: snapshot,
    retry,
    cancel() {
      if (!session?.blob || !session.attempt || session.hasResult) return false;
      session.attempt.abort(new Error("TRANSCRIPTION_CANCELLED"));
      return true;
    },
    getRetainedAudio() { return pending?.blob || null; },
    discard() {
      if (session || !pending) return false;
      pending.blob = null;
      pending = null;
      publish({ phase: "idle", error: null, canRetry: false });
      return true;
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    toggle(source = "interface") {
      if (state.phase === "recording") return stop();
      if (pending) return retry();
      return start(source);
    },
  };
}

module.exports = { createRecordingController };
