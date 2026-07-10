const { contextBridge, ipcRenderer } = require("electron");
let recorder,
  chunks = [],
  stream;
let localTranscriber;
async function transcribeLocally(blob, language) {
  ipcRenderer.send("transcription:status", "Ładuję lokalny model Whisper…");
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
  if (!localTranscriber) {
    const { pipeline } = await import("@huggingface/transformers");
    localTranscriber = await pipeline(
      "automatic-speech-recognition",
      "onnx-community/whisper-tiny",
    );
  }
  ipcRenderer.send("transcription:status", "Transkrybuję lokalnie…");
  const result = await localTranscriber(rendered.getChannelData(0), {
    language: language || "pl",
    task: "transcribe",
  });
  return ipcRenderer.invoke("transcription:save", result.text);
}
async function start() {
  stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
  });
  chunks = [];
  recorder = new MediaRecorder(stream);
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.start();
  ipcRenderer.send("recording:state", true);
}
function stop() {
  return new Promise((resolve, reject) => {
    if (!recorder) return reject(new Error("Nagrywanie nie jest aktywne"));
    recorder.onstop = async () => {
      try {
        const blob = new Blob(chunks, { type: recorder.mimeType });
        stream?.getTracks().forEach((t) => t.stop());
        recorder = null;
        const settings = await ipcRenderer.invoke("settings:get");
        const useLocal = settings.provider === "local" || !settings.apiKey;
        const result = useLocal
          ? await transcribeLocally(blob, settings.language)
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
    recorder.stop();
    ipcRenderer.send("recording:state", false);
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
  onRecordingToggle: (cb) => {
    const f = async (_, v) => {
      try {
        if (v && !recorder) await start();
        else if (!v && recorder) await stop();
        cb(v);
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
