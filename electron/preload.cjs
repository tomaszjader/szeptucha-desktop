const { contextBridge, ipcRenderer } = require("electron");
const { createRecordingController } = require("./recording-controller.cjs");
async function transcribeLocally(blob, report, signal) {
  signal.throwIfAborted();
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

  signal.throwIfAborted();
  return requestTranscription("audio:transcribe-local", rendered.getChannelData(0), null, report, signal);
}

async function requestTranscription(channel, data, mime, report, signal) {
  signal.throwIfAborted();
  const requestId = crypto.randomUUID();
  const cancel = () => ipcRenderer.send("audio:cancel", requestId);
  const progress = (_, message) => {
    if (!signal.aborted && message?.requestId === requestId) report(message.patch);
  };
  ipcRenderer.on("audio:local-progress", progress);
  signal.addEventListener("abort", cancel, { once: true });
  try { return await ipcRenderer.invoke(channel, data, mime, requestId); }
  finally {
    signal.removeEventListener("abort", cancel);
    ipcRenderer.removeListener("audio:local-progress", progress);
  }
}

const recording = createRecordingController({
  drafts: {
    load: async () => {
      const saved = await ipcRenderer.invoke("recording:draft-load");
      return saved ? { ...saved, blob: new Blob([saved.audio], { type: saved.mime }) } : null;
    },
    append: async (id, blob, meta) => ipcRenderer.invoke("recording:draft-append", id, await blob.arrayBuffer(), meta),
    save: async (id, blob, meta) => ipcRenderer.invoke("recording:draft-save", id, await blob.arrayBuffer(), meta),
    saveResult: (id, result) => ipcRenderer.invoke("recording:draft-result", id, result),
    clear: id => ipcRenderer.invoke("recording:draft-clear", id),
  },
  getUserMedia: () => navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  }),
  createMediaRecorder: stream => new MediaRecorder(stream),
  transcribe: async (blob, report, signal) => {
    const settings = await ipcRenderer.invoke("settings:get");
    signal.throwIfAborted();
    if (settings.provider === "local" || !settings.apiKey) return transcribeLocally(blob, report, signal);
    const data = await blob.arrayBuffer();
    signal.throwIfAborted();
    return requestTranscription("audio:transcribe", data, blob.type, report, signal);
  },
  complete: result => ipcRenderer.invoke("transcription:paste", result.text),
  onState: state => ipcRenderer.send("recording:state", state),
  onError: message => ipcRenderer.send("recording:error", message),
});

void recording.restore();

// Always listen, including before React mounts and while a different tab is open.
ipcRenderer.on("recording:toggle", (_, source) => {
  void recording.toggle(source === "shortcut" ? "shortcut" : "tray");
});

contextBridge.exposeInMainWorld("szeptucha", {
  openOcr: () => ipcRenderer.send("ocr:show"),
  setTheme: theme => ipcRenderer.send("theme:set", theme),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  getShortcutState: () => ipcRenderer.invoke("shortcuts:get"),
  onShortcutState: cb => {
    const listener = (_, state) => cb(state);
    ipcRenderer.on("shortcuts:state", listener);
    return () => ipcRenderer.removeListener("shortcuts:state", listener);
  },
  saveSettings: settings => ipcRenderer.invoke("settings:save", settings),
  chooseFolder: () => ipcRenderer.invoke("folder:choose"),
  openFolder: () => ipcRenderer.invoke("folder:open"),
  correctSelection: () => ipcRenderer.invoke("text:correct"),
  cancelCorrection: () => ipcRenderer.invoke("text:cancel-correction"),
  getCorrectionState: () => ipcRenderer.invoke("text:correction-state"),
  onCorrectionState: cb => {
    const listener = (_, state) => cb(state);
    ipcRenderer.on("correction:state", listener);
    return () => ipcRenderer.removeListener("correction:state", listener);
  },
  toggleRecording: () => recording.toggle("interface"),
  retryTranscription: () => recording.retry(),
  cancelTranscription: () => recording.cancel(),
  discardRecording: () => recording.discard(),
  saveRecording: async () => {
    const blob = recording.getRetainedAudio();
    if (!blob) return false;
    return ipcRenderer.invoke("recording:save-audio", await blob.arrayBuffer(), blob.type);
  },
  getRecordingState: () => recording.getState(),
  onRecordingState: cb => recording.subscribe(cb),
  getNotes: options => ipcRenderer.invoke("notes:get", options),
  readNote: filePath => ipcRenderer.invoke("notes:read", filePath),
  deleteNote: filePath => ipcRenderer.invoke("notes:delete", filePath),
  onStatus: cb => {
    const f = (_, value) => cb(value);
    ipcRenderer.on("status", f);
    return () => ipcRenderer.removeListener("status", f);
  },
});
