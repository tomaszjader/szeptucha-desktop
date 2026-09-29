// One lifecycle for the button, global shortcut and tray. The preload owns it,
// so hiding the window or switching React tabs cannot interrupt a recording.
function createRecordingController({ getUserMedia, createMediaRecorder, transcribe, complete, onState, onError, now = Date.now }) {
  let state = { phase: "idle", source: "interface", startedAt: null, durationMs: 0, downloadProgress: null, error: null };
  let session = null;
  const listeners = new Set();
  const snapshot = () => ({ ...state });

  function publish(patch) {
    state = { ...state, ...patch };
    onState(snapshot());
    for (const listener of listeners) listener(snapshot());
  }

  function releaseCapture(active) {
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
    const message = error instanceof Error ? error.message : String(error);
    publish({ phase: "error", downloadProgress: null, error: message,
      durationMs: state.phase === "recording" ? Math.max(0, now() - state.startedAt) : state.durationMs });
    onError(message);
  }

  async function start(source) {
    if (!["idle", "completed", "error"].includes(state.phase)) return;
    const active = { stream: null, recorder: null, chunks: [], rejectStop: null };
    session = active;
    publish({ phase: "starting", source, startedAt: null, durationMs: 0, downloadProgress: null, error: null });
    try {
      active.stream = await getUserMedia();
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

  async function stop() {
    if (state.phase !== "recording" || !session) return;
    const active = session;
    publish({ phase: "transcribing", durationMs: Math.max(0, now() - state.startedAt) });
    try {
      const blob = await new Promise((resolve, reject) => {
        active.rejectStop = reject;
        active.recorder.onstop = () => resolve(new Blob(active.chunks, { type: active.recorder.mimeType }));
        active.recorder.stop();
      });
      active.rejectStop = null;
      releaseCapture(active);
      active.chunks = [];
      const result = await transcribe(blob, patch => {
        if (session === active) publish(patch);
      });
      await complete(result);
      if (session === active) {
        session = null;
        publish({ phase: "completed", downloadProgress: null });
      }
      return result;
    } catch (error) {
      fail(active, error);
    } finally {
      releaseCapture(active);
    }
  }

  return {
    getState: snapshot,
    subscribe(listener) {
      listeners.add(listener);
      listener(snapshot());
      return () => listeners.delete(listener);
    },
    toggle(source = "interface") {
      if (state.phase === "recording") return stop();
      return start(source);
    },
  };
}

module.exports = { createRecordingController };
