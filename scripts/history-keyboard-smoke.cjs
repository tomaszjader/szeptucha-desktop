// Exercise the packaged renderer with real Chromium keyboard events and isolated data.
const { app, BrowserWindow, clipboard } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const archive = process.argv[2];
assert.ok(archive, "Pass the installed app.asar path");
const directory = fs.mkdtempSync(path.join(app.getPath("temp"), "SzeptuchaKeyboardSmoke-"));
const notes = path.join(directory, "notes");
fs.mkdirSync(notes);
fs.writeFileSync(path.join(notes, "notatka-żółw.txt"), "Keyboard smoke test note.");
app.setPath("userData", directory);
fs.writeFileSync(path.join(directory, "settings.json"), JSON.stringify({
  folder: notes, provider: "local", appLanguage: "en", launchAtStartup: false,
}));
process.env.VITE_DEV_SERVER_URL = pathToFileURL(path.join(archive, "dist", "index.html")).href;
const timeout = setTimeout(() => { console.error("History keyboard smoke test timed out"); app.exit(1); }, 60_000);
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
  const originalClipboard = clipboard.readText();
  try {
    const window = await until(() => BrowserWindow.getAllWindows().find(candidate =>
      candidate.webContents.getURL().endsWith("/dist/index.html") && !candidate.webContents.isLoading()), "main renderer");
    const evaluate = expression => window.webContents.executeJavaScript(expression, true);
    await until(() => evaluate('document.querySelectorAll("aside nav button").length === 4'), "navigation ready");
    window.show();
    window.focus();
    window.webContents.focus();
    const key = async (keyCode, modifiers = []) => {
      window.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
      // sendInputEvent does not generate the character/keypress stage automatically.
      // Native button activation on Enter requires the carriage-return character.
      const character = keyCode === "Return" ? String.fromCharCode(13) : keyCode === "Space" ? " " : null;
      if (character) window.webContents.sendInputEvent({ type: "char", keyCode: character, modifiers });
      window.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
      await delay(100);
    };
    await evaluate('document.querySelectorAll("aside nav button")[1].click()');
    await until(() => evaluate('Boolean(document.querySelector("button.note-open"))'), "note list");
    assert.equal(await evaluate('document.querySelector(".note-open").getAttribute("aria-label")'), "notatka-żółw.txt");

    await evaluate('document.querySelector(".search-bar input").focus()');
    await key("Tab");
    assert.equal(await evaluate('document.activeElement.matches("button.note-open")'), true, "Tab reaches note opener");
    assert.equal(await evaluate('document.activeElement.matches(":focus-visible")'), true, "keyboard focus is visible");
    assert.notEqual(await evaluate('getComputedStyle(document.activeElement).outlineStyle'), "none");
    await key("Return");
    await until(() => evaluate('Boolean(document.querySelector("dialog.note-modal:modal"))'), "Enter opens modal");
    await until(() => evaluate('document.querySelector(".note-modal-body pre").textContent === "Keyboard smoke test note."'), "full note text");
    assert.equal(await evaluate('document.activeElement.id'), "note-dialog-title", "preview title receives initial focus");
    assert.equal(await evaluate('document.querySelector("dialog").getAttribute("aria-labelledby")'), "note-dialog-title");

    await key("Tab");
    assert.equal(await evaluate('document.activeElement.matches(".note-modal-footer .secondary")'), true, "Tab reaches Copy");
    await key("Tab");
    assert.equal(await evaluate('document.activeElement.matches(".note-close")'), true, "Tab reaches Close");
    await key("Tab");
    assert.equal(await evaluate('document.querySelector("dialog").contains(document.activeElement)'), true, "forward Tab stays in modal");
    await key("Tab", ["shift"]);
    assert.equal(await evaluate('document.querySelector("dialog").contains(document.activeElement)'), true, "reverse Tab stays in modal");
    await evaluate('document.querySelector(".search-bar input").focus()');
    assert.equal(await evaluate('document.querySelector("dialog").contains(document.activeElement)'), true, "background is inert");
    await key("Escape");
    await until(() => evaluate('!document.querySelector("dialog") && document.activeElement.matches("button.note-open")'), "Escape closes and restores focus");

    await key("Tab");
    assert.equal(await evaluate('document.activeElement.matches(".note-card-actions .icon-btn:not(.danger)")'), true);
    await key("Return");
    await until(() => clipboard.readText() === "Keyboard smoke test note.", "keyboard Copy action");
    assert.equal(await evaluate('Boolean(document.querySelector("dialog"))'), false, "Copy does not open preview");
    await key("Tab");
    assert.equal(await evaluate('document.activeElement.matches(".note-card-actions .danger")'), true, "trash action is separately focusable");
    await key("Tab", ["shift"]);
    await key("Tab", ["shift"]);
    assert.equal(await evaluate('document.activeElement.matches("button.note-open")'), true);
    await key("Space");
    await until(() => evaluate('Boolean(document.querySelector("dialog:modal"))'), "Space opens preview");
    await evaluate('document.querySelector(".note-close").focus()');
    await key("Return");
    await until(() => evaluate('!document.querySelector("dialog") && document.activeElement.matches("button.note-open")'), "Close restores focus");
    console.log("Packaged history keyboard smoke test passed: Tab, Enter, Space, Escape, modal focus and focus restoration.");
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    clipboard.writeText(originalClipboard);
    clearTimeout(timeout);
    for (const window of BrowserWindow.getAllWindows()) window.destroy();
    // Chromium may still hold its isolated profile open on Windows; OS temp cleanup handles it.
    try { fs.rmSync(directory, { recursive: true, force: true }); } catch {}
    app.exit(exitCode);
  }
});
