const { app, utilityProcess } = require("electron");
const assert = require("node:assert/strict");
const path = require("node:path");
const { once } = require("node:events");
const { createWhisperProcess } = require("../electron/whisper-process.cjs");
const deadline = setTimeout(() => { console.error("Whisper process smoke test timed out"); app.exit(1); }, 60_000);

app.whenReady().then(async () => {
  let service;
  let packaged;
  try {
    const archive = process.argv[2];
    assert.ok(archive, "Pass the installed app.asar path");
    // Import the actual packaged worker and native runtime without downloading a model.
    packaged = utilityProcess.fork(path.join(archive, "electron", "whisper-worker.cjs"), [path.join(app.getPath("temp"), "SzeptuchaWhisperSmoke")], { stdio: "pipe" });
    let stderr = "";
    packaged.stderr?.on("data", chunk => { stderr = (stderr + chunk).slice(-4000); });
    await new Promise((resolve, reject) => {
      const exited = code => reject(new Error(`Packaged Whisper exited (${code}): ${stderr}`));
      packaged.once("exit", exited);
      packaged.on("message", message => {
        if (message.type === "ready") { packaged.removeListener("exit", exited); resolve(); }
        else if (message.type === "fatal") reject(new Error(message.error));
      });
    });
    const packagedExit = once(packaged, "exit");
    assert.equal(packaged.kill(), true);
    await packagedExit;
    console.log("Packaged Whisper runtime imported and terminated successfully.");

    const children = [];
    service = createWhisperProcess({
      workerPath: path.join(__dirname, "fixtures", "whisper-busy.cjs"),
      cacheDirectory: app.getPath("temp"),
      fork: (...args) => { const child = utilityProcess.fork(...args); children.push(child); return child; },
    });
    const controller = new AbortController();
    let started;
    const running = new Promise(resolve => { started = resolve; });
    const request = service.transcribe(new Float32Array([0]), {}, { signal: controller.signal, onProgress: started });
    const rejected = assert.rejects(request, /TRANSCRIPTION_CANCELLED/);
    await running;
    const exited = once(children[0], "exit");
    controller.abort(new Error("TRANSCRIPTION_CANCELLED"));
    await rejected;
    await exited;
    assert.equal(children[0].pid, undefined);
    assert.equal(await service.transcribe(new Float32Array([1]), {}), "retry succeeded");
    assert.equal(children.length, 2);
    const retryExit = once(children[1], "exit");
    service.dispose();
    await retryExit;
    console.log("Busy Whisper process terminated; retry used a new process successfully.");
    app.exit(0);
  } finally {
    clearTimeout(deadline);
    service?.dispose();
    if (packaged?.pid) packaged.kill();
  }
}).catch(error => { console.error(error); app.exit(1); });
