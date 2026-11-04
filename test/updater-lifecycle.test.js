const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const crypto = require("node:crypto");
const { EventEmitter, once } = require("node:events");
const { PassThrough } = require("node:stream");

const source = fs.readFileSync(path.join(__dirname, "../electron/updater.cjs"), "utf8");

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "szeptucha-updater-test-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const payload = Buffer.from("verified installer");
  const digest = crypto.createHash("sha256").update(payload).digest("hex");
  const installerName = "Szeptucha-Setup-0.2.0.exe";
  const release = {
    tag_name: "v0.2.0",
    assets: [installerName, "SHA256SUMS.txt"].map(name => ({
      name, size: payload.length,
      browser_download_url: `https://github.com/tomaszjader/szeptucha-desktop/releases/download/v0.2.0/${name}`,
    })),
  };
  const state = {
    root, dialogs: [], launches: [], quit: 0, unref: 0,
    downloadMode: "ok", launchMode: "manual", readyResponse: 0,
    started: new EventEmitter(), responses: [],
  };
  const https = {
    get(url, options, callback) {
      const request = new EventEmitter();
      queueMicrotask(() => {
        const response = new PassThrough();
        state.responses.push(response);
        response.statusCode = 200;
        response.headers = {};
        callback(response);
        if (url.hostname === "api.github.com") response.end(JSON.stringify(release));
        else if (url.pathname.endsWith("SHA256SUMS.txt")) response.end(`${digest}  ${installerName}\n`);
        else if (state.downloadMode === "interrupted") {
          response.write(payload.subarray(0, 4));
          setImmediate(() => response.destroy(new Error("Connection reset")));
        } else response.end(state.downloadMode === "corrupt" ? "corrupt installer" : payload);
      });
      return request;
    },
  };
  const spawn = (file, args, options) => {
    assert.equal(fs.readFileSync(file, "utf8"), payload.toString());
    const child = new EventEmitter();
    child.unref = () => { state.unref += 1; };
    state.launches.push({ file, args, options, child });
    queueMicrotask(() => {
      state.started.emit("launch");
      if (state.launchMode === "error") child.emit("error", new Error("EACCES"));
    });
    if (state.launchMode === "sync-error") throw new Error("Cannot spawn installer");
    return child;
  };
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module, Buffer, URL, console, process,
    require(name) {
      if (name === "https") return https;
      if (name === "child_process") return { spawn };
      if (name === "os") return { tmpdir: () => root };
      return require(name);
    },
  }, { filename: "updater.cjs" });
  state.updater = module.exports.createUpdater({
    app: { isPackaged: true, getVersion: () => "0.1.0", quit: () => { state.quit += 1; } },
    platform: "win32",
    dialog: { async showMessageBox(options) {
      state.dialogs.push(options);
      return { response: options.message === "The update has been downloaded." ? state.readyResponse : 0 };
    } },
    logger: { error() {} },
  });
  state.waitForLaunch = () => once(state.started, "launch");
  return state;
}

test("keeps the app open until the installer emits spawn, then quits once", async t => {
  const state = fixture(t);
  const launch = state.waitForLaunch();
  const check = state.updater.checkForUpdates();
  await launch;
  assert.equal(state.quit, 0);
  assert.equal(state.unref, 0);
  await state.updater.checkForUpdates();
  assert.equal(state.launches.length, 1, "a simultaneous check must not start another installer");
  state.launches[0].child.emit("spawn");
  await check;
  assert.equal(state.quit, 1);
  assert.equal(state.unref, 1);
  assert.ok(fs.existsSync(state.launches[0].file), "running installer must not be removed");
});

for (const launchMode of ["error", "sync-error"]) {
  test(`installer ${launchMode} keeps the app open, cleans files and allows retry`, async t => {
    const state = fixture(t);
    state.launchMode = launchMode;
    await state.updater.checkForUpdates();
    assert.equal(state.quit, 0);
    assert.equal(state.unref, 0);
    assert.equal(state.dialogs.at(-1).type, "error");
    assert.match(state.dialogs.at(-1).message, /installer could not be started/);
    assert.deepEqual(fs.readdirSync(state.root), []);
    const failedFile = state.launches[0].file;
    state.launchMode = "manual";
    const launch = state.waitForLaunch();
    const retry = state.updater.checkForUpdates();
    await launch;
    assert.notEqual(state.launches[1].file, failedFile);
    state.launches[1].child.emit("spawn");
    await retry;
    assert.equal(state.quit, 1);
  });
}

for (const downloadMode of ["interrupted", "corrupt"]) {
  test(`${downloadMode} download closes streams, cleans files and allows retry`, async t => {
    const state = fixture(t);
    state.downloadMode = downloadMode;
    await state.updater.checkForUpdates();
    assert.equal(state.quit, 0);
    assert.equal(state.launches.length, 0);
    assert.equal(state.dialogs.at(-1).type, "error");
    assert.deepEqual(fs.readdirSync(state.root), []);
    assert.ok(state.responses.at(-1).closed);
    state.downloadMode = "ok";
    state.readyResponse = 1;
    await state.updater.checkForUpdates();
    assert.equal(state.dialogs.at(-1).message, "The update has been downloaded.");
    assert.deepEqual(fs.readdirSync(state.root), []);
  });
}

test("Later removes the verified download without launching or quitting", async t => {
  const state = fixture(t);
  state.readyResponse = 1;
  await state.updater.checkForUpdates();
  assert.equal(state.launches.length, 0);
  assert.equal(state.quit, 0);
  assert.deepEqual(fs.readdirSync(state.root), []);
});

test("a leftover download at the old fixed path does not block a new update", async t => {
  const state = fixture(t);
  const oldFile = path.join(state.root, "Szeptucha-Setup-0.2.0.exe");
  fs.writeFileSync(oldFile, "stale download");
  state.readyResponse = 1;
  await state.updater.checkForUpdates();
  assert.equal(state.dialogs.at(-1).message, "The update has been downloaded.");
  assert.equal(fs.readFileSync(oldFile, "utf8"), "stale download");
  assert.deepEqual(fs.readdirSync(state.root), [path.basename(oldFile)]);
});
