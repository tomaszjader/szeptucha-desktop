const MODELS = {
  "whisper-tiny": "onnx-community/whisper-tiny",
  "whisper-base": "onnx-community/whisper-base",
  "whisper-small": "onnx-community/whisper-small",
};

function createWhisperEngine(pipeline) {
  let transcriber;
  let currentModel;
  return async (samples, settings, report) => {
    const model = MODELS[settings.whisperModel] || MODELS["whisper-tiny"];
    if (!transcriber || currentModel !== model) {
      await transcriber?.dispose();
      transcriber = null;
      report({ phase: "loading-model", downloadProgress: null });
      transcriber = await pipeline("automatic-speech-recognition", model, {
        device: "cpu",
        progress_callback: event => {
          if (event.status !== "progress_total") return;
          report({ phase: "loading-model", downloadProgress: event.total > 0 && Number.isFinite(event.progress)
            ? Math.max(0, Math.min(100, Math.floor(event.progress))) : null });
        },
      });
      currentModel = model;
    }
    report({ phase: "transcribing", downloadProgress: null });
    const result = await transcriber(samples, {
      language: settings.language && settings.language !== "auto" ? settings.language : null,
      task: "transcribe",
    });
    if (typeof result?.text !== "string" || !result.text.trim()) throw new Error("Empty transcription");
    return result.text;
  };
}

module.exports = { createWhisperEngine };
