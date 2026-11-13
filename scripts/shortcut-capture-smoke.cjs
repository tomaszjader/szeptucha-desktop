// Run against the installed app with an isolated profile and real Windows key presses.
const { app, BrowserWindow, globalShortcut } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { once } = require("node:events");
const { pathToFileURL } = require("node:url");
const execFile = require("node:util").promisify(require("node:child_process").execFile);
const archive = process.argv[2];
assert.ok(archive, "Pass the installed app.asar path");
const directory = fs.mkdtempSync(path.join(app.getPath("temp"), "SzeptuchaCaptureSmoke-"));
const notes = path.join(directory, "notes");
fs.mkdirSync(notes);
app.setPath("userData", directory);
fs.writeFileSync(path.join(directory, "settings.json"), JSON.stringify({ folder: notes, provider: "local", appLanguage: "en" }));
process.env.VITE_DEV_SERVER_URL = pathToFileURL(path.join(archive, "dist", "index.html")).href;
const timeout = setTimeout(() => { console.error("Shortcut capture smoke test timed out"); app.exit(1); }, 60_000);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(check, description) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const result = await check();
    if (result) return result;
    await delay(50);
  }
  throw new Error(`Timed out: ${description}`);
}
require(path.join(archive, "electron", "main.cjs"));

app.whenReady().then(async () => {
  let exitCode = 0;
  let probe;
  try {
    const window = await until(() => BrowserWindow.getAllWindows().find(candidate =>
      candidate.webContents.getURL().endsWith("/dist/index.html") && !candidate.webContents.isLoading()), "main renderer");
    const evaluate = expression => window.webContents.executeJavaScript(expression, true);
    const settingsPage = async () => {
      await until(() => evaluate('document.querySelectorAll("aside nav button").length === 4'), "navigation");
      await evaluate('document.querySelectorAll("aside nav button")[3].click()');
      await until(() => evaluate('document.querySelectorAll(".hotkey-recorder input").length === 2'), "shortcut settings");
    };
    window.show(); window.focus(); window.webContents.focus();
    await settingsPage();
    await until(() => evaluate('window.szeptucha.getShortcutState().then(Boolean)'), "registered shortcuts");
    const beginCapture = async () => {
      await evaluate('document.querySelector(".key button").focus(); document.querySelectorAll(".hotkey-recorder input")[0].focus()');
      await until(() => globalShortcut.isSuspended(), "global handling suspended");
    };
    const key = async (keyCode, modifiers = []) => {
      window.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
      window.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
      await delay(100);
    };

    let activations = 0;
    const probeKey = ["F9", "F10", "F11"].find(keyCode => {
      const accelerator = `Control+Alt+Shift+${keyCode}`;
      if (!globalShortcut.register(accelerator, () => { activations += 1; })) return false;
      probe = accelerator;
      return true;
    });
    assert.ok(probeKey, "a disposable global probe shortcut must register");
    const nativePress = () => execFile("powershell.exe", ["-NoProfile", "-STA", "-Command",
      `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('^%+{${probeKey}}')`], { windowsHide: true, timeout: 10_000 });
    await beginCapture();
    assert.equal(globalShortcut.isRegistered(probe), true, "suspension preserves the registration");
    await nativePress();
    await until(() => !globalShortcut.isSuspended(), "accepted combination resumes shortcuts");
    assert.equal(activations, 0, "the captured native combination must not invoke its global action");
    assert.equal(await evaluate('document.querySelectorAll(".hotkey-recorder input")[0].value'), `Ctrl+Alt+Shift+${probeKey}`);
    assert.equal(await evaluate('window.szeptucha.getRecordingState().phase'), "idle");
    await nativePress();
    await until(() => activations === 1, "the same native global shortcut works after capture ends");

    await beginCapture();
    await key("Escape");
    await until(() => !globalShortcut.isSuspended(), "Escape resumes shortcuts");
    await evaluate('document.querySelectorAll(".hotkey-recorder input")[0].click()');
    await until(() => globalShortcut.isSuspended(), "click restarts capture on an already focused input");
    await key("Tab");
    await until(() => evaluate('document.activeElement === document.querySelectorAll(".hotkey-recorder input")[1]'), "Tab moves to correction");
    assert.equal(globalShortcut.isSuspended(), true, "capture transfers to the second input");
    await key("Tab");
    await until(() => !globalShortcut.isSuspended(), "Tab out of shortcut inputs resumes handling");

    await beginCapture();
    await evaluate('document.querySelector(".key button").focus()');
    await until(() => !globalShortcut.isSuspended(), "input blur resumes handling");
    await beginCapture();
    const beforeSave = await evaluate('window.szeptucha.getShortcutState()');
    await evaluate('(async () => window.szeptucha.saveSettings(await window.szeptucha.getSettings()))()');
    assert.deepEqual(await evaluate('window.szeptucha.getShortcutState()'), beforeSave, "saving during capture must not fail registrations");
    assert.equal(globalShortcut.isSuspended(), true, "saving retains capture suspension");
    await key("Escape");
    await until(() => !globalShortcut.isSuspended(), "capture can still end after saving");

    await beginCapture();
    await evaluate('document.querySelectorAll("aside nav button")[0].click()');
    await until(() => !globalShortcut.isSuspended(), "leaving settings cleans up capture");
    await settingsPage();
    await beginCapture();
    window.hide();
    await until(() => !globalShortcut.isSuspended(), "hiding the app resumes global handling");
    window.show(); window.focus(); window.webContents.focus();
    await until(() => window.isFocused(), "main window regains focus");
    await beginCapture();
    const loaded = once(window.webContents, "did-finish-load");
    window.webContents.reload();
    await loaded;
    await until(() => !globalShortcut.isSuspended(), "renderer reload cannot leave global shortcuts paused");
    assert.equal(globalShortcut.isRegistered(probe), true, "lifecycle cleanup retains registered shortcuts");
    console.log("Packaged shortcut capture passed: native global suppression/resume, acceptance, Escape, Tab, blur, save, unmount, hide and reload.");
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    globalShortcut.setSuspended(false);
    if (probe) globalShortcut.unregister(probe);
    clearTimeout(timeout);
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    try { fs.rmSync(directory, { recursive: true, force: true }); } catch {}
    app.exit(exitCode);
  }
});
