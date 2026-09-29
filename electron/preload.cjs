const { contextBridge, ipcRenderer } = require("electron");
const { createRecordingController } = require("./recording-controller.cjs");
let localTranscriber;
let currentWhisperModel = null;

const WHISPER_MODELS = {
  "whisper-tiny": "onnx-community/whisper-tiny",
  "whisper-base": "onnx-community/whisper-base",
  "whisper-small": "onnx-community/whisper-small",
};

async function transcribeLocally(blob, settings, report) {
  const context = new AudioContext();
  let rendered;
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const offline = new OfflineAudioContext(1, Math.ceil(decoded.duration * 16000), 16000);
    const source = offline.createBufferSource();
    source.buffer = decoded;
    source.connect(offline.destination);
    source.start();
    rendered = await offline.startRendering();
  } finally {
    await context.close();
  }

  const hfModelId = WHISPER_MODELS[settings.whisperModel] || WHISPER_MODELS["whisper-tiny"];
  if (!localTranscriber || currentWhisperModel !== hfModelId) {
    report({ phase: "loading-model", downloadProgress: null });
    const { pipeline } = await import("@huggingface/transformers");
    // Transformers reports aggregate progress as model files are downloaded.
    // Keep the indicator indeterminate when the total size is unavailable.
    let lastProgress = null;
    const nextTranscriber = await pipeline("automatic-speech-recognition", hfModelId, {
      progress_callback: event => {
        if (event.status !== "progress_total") return;
        const progress = event.total > 0 && Number.isFinite(event.progress)
          ? Math.max(0, Math.min(100, Math.floor(event.progress)))
          : null;
        if (progress === lastProgress) return;
        lastProgress = progress;
        report({ phase: "loading-model", downloadProgress: progress });
      },
    });
    localTranscriber = nextTranscriber;
    currentWhisperModel = hfModelId;
  }

  report({ phase: "transcribing", downloadProgress: null });
  const result = await localTranscriber(rendered.getChannelData(0), {
    language: settings.language && settings.language !== "auto" ? settings.language : null,
    task: "transcribe",
  });
  return ipcRenderer.invoke("transcription:save", result.text);
}

const recording = createRecordingController({
  getUserMedia: () => navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  }),
  createMediaRecorder: stream => new MediaRecorder(stream),
  transcribe: async (blob, report) => {
    const settings = await ipcRenderer.invoke("settings:get");
    return settings.provider === "local" || !settings.apiKey
      ? transcribeLocally(blob, settings, report)
      : ipcRenderer.invoke("audio:transcribe", await blob.arrayBuffer(), blob.type);
  },
  complete: result => ipcRenderer.invoke("transcription:paste", result.text),
  onState: state => ipcRenderer.send("recording:state", state),
  onError: message => ipcRenderer.send("recording:error", message),
});

// Always listen, including before React mounts and while a different tab is open.
ipcRenderer.on("recording:toggle", (_, source) => {
  void recording.toggle(source === "shortcut" ? "shortcut" : "tray");
});

contextBridge.exposeInMainWorld("szeptucha", {
  openOcr: () => ipcRenderer.send("ocr:show"),
  setTheme: theme => ipcRenderer.send("theme:set", theme),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: settings => ipcRenderer.invoke("settings:save", settings),
  chooseFolder: () => ipcRenderer.invoke("folder:choose"),
  openFolder: () => ipcRenderer.invoke("folder:open"),
  correctSelection: () => ipcRenderer.invoke("text:correct"),
  toggleRecording: () => recording.toggle("interface"),
  getRecordingState: () => recording.getState(),
  onRecordingState: cb => recording.subscribe(cb),
  getNotes: () => ipcRenderer.invoke("notes:get"),
  readNote: filePath => ipcRenderer.invoke("notes:read", filePath),
  deleteNote: filePath => ipcRenderer.invoke("notes:delete", filePath),
  onStatus: cb => {
    const f = (_, value) => cb(value);
    ipcRenderer.on("status", f);
    return () => ipcRenderer.removeListener("status", f);
  },
});
