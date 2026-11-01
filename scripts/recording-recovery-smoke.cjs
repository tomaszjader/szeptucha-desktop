const { app, BrowserWindow } = require("electron");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs/promises");
app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
const timeout = setTimeout(() => { console.error("Recording recovery smoke test timed out"); app.exit(1); }, 30_000);

app.whenReady().then(async () => {
  let window;
  let directory;
  try {
    const archive = process.argv[2];
    const { createRecordingDrafts } = require(path.join(archive, "electron", "recording-drafts.cjs"));
    const { createRecordingController } = require(path.join(archive, "electron", "recording-controller.cjs"));
    directory = await fs.mkdtemp(path.join(app.getPath("temp"), "SzeptuchaRecoverySmoke-"));
    window = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
    await window.loadURL("data:text/html,<html><body>Recording recovery test</body></html>");
    // Keep only the first periodic chunk, as if recording had crashed before stop.
    const recording = await window.webContents.executeJavaScript(`(async () => {
      const context = new AudioContext();
      await context.resume();
      const destination = context.createMediaStreamDestination();
      const oscillator = context.createOscillator();
      oscillator.connect(destination);
      oscillator.start();
      const recorder = new MediaRecorder(destination.stream);
      const firstChunk = new Promise(resolve => { recorder.ondataavailable = event => { if (event.data.size) resolve(event.data); }; });
      recorder.start(1000);
      const chunk = await firstChunk;
      const stopped = new Promise(resolve => { recorder.onstop = resolve; });
      recorder.stop();
      await stopped;
      oscillator.stop();
      destination.stream.getTracks().forEach(track => track.stop());
      await context.close();
      return { bytes: [...new Uint8Array(await chunk.arrayBuffer())], mime: chunk.type };
    })()`);
    const store = createRecordingDrafts({ directory });
    await store.append(null, Buffer.from(recording.bytes), { mime: recording.mime, startedAt: Date.now() - 1000, durationMs: 1000 });
    const restartedStore = createRecordingDrafts({ directory });
    const recovered = await restartedStore.load();
    assert.deepEqual([...recovered.audio], recording.bytes);
    const duration = await window.webContents.executeJavaScript(`(async () => {
      const context = new AudioContext();
      try { return (await context.decodeAudioData(new Uint8Array(${JSON.stringify([...recovered.audio])}).buffer)).duration; }
      finally { await context.close(); }
    })()`);
    assert.ok(duration > 0, "Recovered partial WebM must be decodable");
    const controller = createRecordingController({
      getUserMedia: () => assert.fail("Recovery must not start recording"),
      createMediaRecorder: () => assert.fail("Recovery must not create a recorder"),
      transcribe: () => assert.fail("Recovery must not call an API automatically"),
      complete: () => assert.fail("Recovery must not paste automatically"),
      onState() {}, onError() {},
      drafts: {
        load: async () => ({ ...recovered, blob: new Blob([recovered.audio], { type: recovered.mime }) }),
        clear: id => restartedStore.clear(id),
      },
    });
    await controller.restore();
    assert.equal(controller.getState().error, "RECORDING_RECOVERED");
    assert.equal(await controller.discard(), true);
    assert.equal(await restartedStore.load(), null);
    console.log(`Packaged recording recovery passed: periodic WebM restored and decoded (${duration.toFixed(2)}s), then discarded.`);
  } finally {
    clearTimeout(timeout);
    window?.destroy();
    if (directory) await fs.rm(directory, { recursive: true, force: true });
  }
  app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
