const { contextBridge, ipcRenderer } = require("electron");
let recorder,
  chunks = [],
  stream;
let localTranscriber;
let currentWhisperModel = null;
let recordingTransition = null;

const { preloadTranslations } = require("./translations.cjs");

function getResolvedLang(settings) {
  const langSetting = settings.appLanguage || "system";
  if (langSetting === "system") {
    const browserLanguage = navigator.language.toLowerCase();
    if (browserLanguage.startsWith("pl")) return "pl";
    if (browserLanguage.startsWith("de")) return "de";
    return "en";
  }
  return langSetting;
}

const WHISPER_MODELS = {
  "whisper-tiny": "onnx-community/whisper-tiny",
  "whisper-base": "onnx-community/whisper-base",
  "whisper-small": "onnx-community/whisper-small",
};

async function transcribeLocally(blob, language, resolvedLang, whisperModelSetting) {
  const t = preloadTranslations[resolvedLang] || preloadTranslations.en;
  ipcRenderer.send("transcription:status", t.loadingWhisper);
  const context = new AudioContext();
  const decoded = await context.decodeAudioData(await blob.arrayBuffer());
  const frames = Math.ceil(decoded.duration * 16000);
  const offline = new OfflineAudioContext(1, frames, 16000);
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  await context.close();

  const modelKey = whisperModelSetting && WHISPER_MODELS[whisperModelSetting]
    ? whisperModelSetting
    : "whisper-tiny";
  const hfModelId = WHISPER_MODELS[modelKey];

  if (!localTranscriber || currentWhisperModel !== hfModelId) {
    const { pipeline } = await import("@huggingface/transformers");
    localTranscriber = await pipeline("automatic-speech-recognition", hfModelId);
    currentWhisperModel = hfModelId;
  }
  ipcRenderer.send("transcription:status", t.transcribingLocally);
  const result = await localTranscriber(rendered.getChannelData(0), {
    language: language && language !== "auto" ? language : null,
    task: "transcribe",
  });
  return ipcRenderer.invoke("transcription:save", result.text);
}

async function start() {
  if (recorder?.state === "recording") return;
  if (recordingTransition) return recordingTransition;
  recordingTransition = (async () => {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
    });
    chunks = [];
    recorder = new MediaRecorder(stream);
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.start();
    ipcRenderer.send("recording:state", true);
  })();
  try {
    await recordingTransition;
  } finally {
    recordingTransition = null;
  }
}

function stop() {
  if (recordingTransition) return recordingTransition.then(() => stop());
  if (!recorder || recorder.state !== "recording") {
    const browserLanguage = navigator.language.toLowerCase();
    const sysLang = browserLanguage.startsWith("pl")
      ? "pl"
      : browserLanguage.startsWith("de")
        ? "de"
        : "en";
    return Promise.reject(
      new Error(
        sysLang === "pl"
          ? "Nagrywanie nie jest aktywne"
          : sysLang === "de"
            ? "Die Aufnahme ist nicht aktiv"
            : "Recording is not active",
      ),
    );
  }
  const activeRecorder = recorder;
  recordingTransition = new Promise((resolve, reject) => {
    activeRecorder.onstop = async () => {
      try {
        const blob = new Blob(chunks, { type: activeRecorder.mimeType });
        stream?.getTracks().forEach((track) => track.stop());
        stream = null;
        recorder = null;
        const settings = await ipcRenderer.invoke("settings:get");
        const resolvedLang = getResolvedLang(settings);
        const useLocal = settings.provider === "local" || !settings.apiKey;
        const result = useLocal
          ? await transcribeLocally(blob, settings.language, resolvedLang, settings.whisperModel)
          : await ipcRenderer.invoke(
              "audio:transcribe",
              await blob.arrayBuffer(),
              blob.type,
            );
        await ipcRenderer.invoke("transcription:paste", result.text);
        resolve(result);
      } catch (e) {
        reject(e);
      }
    };
    activeRecorder.onerror = (event) =>
      reject(event.error || new Error("MediaRecorder error"));
    activeRecorder.stop();
    ipcRenderer.send("recording:state", false);
  });
  return recordingTransition.finally(() => {
    recordingTransition = null;
    if (recorder === activeRecorder) recorder = null;
    stream?.getTracks().forEach((track) => track.stop());
    stream = null;
  });
}

contextBridge.exposeInMainWorld("szeptucha", {
  setTheme: (theme) => ipcRenderer.send("theme:set", theme),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (s) => ipcRenderer.invoke("settings:save", s),
  chooseFolder: () => ipcRenderer.invoke("folder:choose"),
  openFolder: () => ipcRenderer.invoke("folder:open"),
  correctSelection: () => ipcRenderer.invoke("text:correct"),
  startRecording: start,
  stopRecording: stop,
  getNotes: () => ipcRenderer.invoke("notes:get"),
  readNote: (filePath) => ipcRenderer.invoke("notes:read", filePath),
  deleteNote: (filePath) => ipcRenderer.invoke("notes:delete", filePath),
  onRecordingToggle: (cb) => {
    const f = async (_, v) => {
      try {
        if (v && recorder?.state !== "recording") await start();
        else if (!v && recorder?.state === "recording") await stop();
        cb(recorder?.state === "recording");
      } catch (e) {
        ipcRenderer.send("recording:error", e.message);
        cb(false);
      }
    };
    ipcRenderer.on("recording:toggle", f);
    return () => ipcRenderer.removeListener("recording:toggle", f);
  },
  onStatus: (cb) => {
    const f = (_, v) => cb(v);
    ipcRenderer.on("status", f);
    return () => ipcRenderer.removeListener("status", f);
  },
});
