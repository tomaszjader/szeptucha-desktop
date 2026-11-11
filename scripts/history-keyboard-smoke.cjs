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

    // Test real folder/IPC failures and recovery in the same isolated packaged app.
    await evaluate('document.querySelectorAll("aside nav button")[0].click()');
    const offlineNotes = `${notes}-offline`;
    fs.renameSync(notes, offlineNotes);
    await evaluate('document.querySelectorAll("aside nav button")[1].click()');
    const hasError = () => evaluate('Boolean(document.querySelector(".history-error [role=alert]"))');
    await until(hasError, "missing folder shows an error");
    assert.equal(await evaluate('Boolean(document.querySelector(".history-empty"))'), false, "folder failure must not show empty history");
    assert.equal(await evaluate('document.querySelector(".history-error [role=alert]").textContent'),
      "Could not load note history. Check that the notes folder exists and you have access to it.");
    assert.equal(await evaluate('(async () => { try { await window.szeptucha.getNotes({}); return false; } catch { return true; } })()'),
      true, "the real notes:get IPC must reject folder read failures");

    const retry = async () => {
      await evaluate('window.previousRetryButton = document.querySelector(".history-retry"); window.previousRetryButton.focus()');
      await key("Return");
      await until(() => evaluate('document.querySelector(".history-container").getAttribute("aria-busy") === "false"'), "retry completes");
    };
    await retry();
    await until(() => evaluate('Boolean(document.querySelector(".history-retry")) && document.querySelector(".history-retry") !== window.previousRetryButton'),
      "a failed retry displays a new error panel");
    assert.equal(await evaluate('document.activeElement.matches(".history-retry")'), true, "failed retry restores keyboard focus");

    // An existing path that is not a directory must also produce an error.
    fs.writeFileSync(notes, "This path is temporarily a file, not the notes folder.");
    await retry();
    await until(hasError, "non-directory notes path shows an error");
    assert.equal(await evaluate('Boolean(document.querySelector(".history-empty"))'), false);
    assert.equal(await evaluate('(async () => { try { await window.szeptucha.getNotes({}); return false; } catch { return true; } })()'), true);

    // Recovery keeps the user's query; a genuinely empty folder is a successful result.
    await evaluate('document.querySelector(".search-bar input").focus()');
    window.webContents.insertText("Keyboard");
    await until(() => evaluate('document.querySelector(".search-bar input").value === "Keyboard"'), "search input is retained");
    await delay(300);
    await until(hasError, "search folder failure is still reported");
    fs.unlinkSync(notes);
    fs.mkdirSync(notes);
    await retry();
    await until(() => evaluate('Boolean(document.querySelector(".history-empty")) && !document.querySelector(".history-error")'), "empty folder succeeds after retry");
    assert.equal(await evaluate('document.querySelector(".search-bar input").value'), "Keyboard", "retry preserves the search query");
    assert.equal(await evaluate('document.activeElement.matches(".search-bar input")'), true, "successful retry focuses search");

    // Restored notes remain readable after the recovery.
    await evaluate('document.querySelectorAll("aside nav button")[0].click()');
    fs.rmdirSync(notes);
    fs.renameSync(offlineNotes, notes);
    await evaluate('document.querySelectorAll("aside nav button")[1].click()');
    await until(() => evaluate('Boolean(document.querySelector(".note-open")) && !document.querySelector(".history-error")'), "restored notes load normally");
    console.log("Packaged history recovery passed: missing/non-directory folders reject, failed retry stays usable, and recovery preserves search and focus.");

    // More than one page is required to detect a preload bridge dropping query options.
    await evaluate('document.querySelectorAll("aside nav button")[0].click()');
    const fixtureNames = [];
    for (let i = 0; i < 29; i += 1) {
      const name = i === 0 ? "filename-igła.txt" : `fixture-${String(i).padStart(2, "0")}.txt`;
      fixtureNames.push(name);
      const file = path.join(notes, name);
      fs.writeFileSync(file, i === 1 ? "Only this note contains needle-body-42." : `Plain fixture ${i}.`);
      const modified = new Date(Date.UTC(2020, 0, 1, 0, 0, i));
      fs.utimesSync(file, modified, modified);
    }
    const firstPage = await evaluate('window.szeptucha.getNotes({ page: 0, search: "" })');
    const secondPage = await evaluate('window.szeptucha.getNotes({ page: 1, search: "" })');
    assert.equal(firstPage.total, 30);
    assert.equal(firstPage.items.length, 24);
    assert.equal(firstPage.page, 0);
    assert.equal(secondPage.total, 30);
    assert.equal(secondPage.items.length, 6);
    assert.equal(secondPage.page, 1);
    assert.equal(firstPage.items.some(first => secondPage.items.some(second => second.id === first.id)), false, "pages must contain different notes");
    const clamped = await evaluate('window.szeptucha.getNotes({ page: 999, search: "" })');
    assert.equal(clamped.page, 1, "backend still clamps pages outside the range");
    const nameMatch = await evaluate('window.szeptucha.getNotes({ page: 0, search: "  IGŁA  " })');
    assert.deepEqual(nameMatch.items.map(note => note.id), [fixtureNames[0]], "filename query reaches backend with Unicode/case handling");
    const bodyMatch = await evaluate('window.szeptucha.getNotes({ page: 0, search: "needle-body-42" })');
    assert.deepEqual(bodyMatch.items.map(note => note.id), [fixtureNames[1]], "body query must not return unrelated notes");

    await evaluate('document.querySelectorAll("aside nav button")[1].click()');
    await until(() => evaluate('document.querySelectorAll(".note-open").length === 24 && Boolean(document.querySelector(".history-pagination"))'), "first UI page");
    const visibleNames = () => evaluate('Array.from(document.querySelectorAll(".note-open"), button => button.getAttribute("aria-label"))');
    assert.deepEqual(await visibleNames(), firstPage.items.map(note => note.id));
    await evaluate('document.querySelectorAll(".history-pagination button")[1].click()');
    await until(() => evaluate('document.querySelector(".history-pagination span")?.textContent.includes("2 / 2") && document.querySelectorAll(".note-open").length === 6'), "Next loads the second page");
    assert.deepEqual(await visibleNames(), secondPage.items.map(note => note.id));
    await evaluate('document.querySelectorAll(".history-pagination button")[0].click()');
    await until(() => evaluate('document.querySelector(".history-pagination span")?.textContent.includes("1 / 2") && document.querySelectorAll(".note-open").length === 24'), "Previous restores the first page");
    assert.deepEqual(await visibleNames(), firstPage.items.map(note => note.id));
    await evaluate('document.querySelectorAll(".history-pagination button")[1].click()');
    await until(() => evaluate('document.querySelectorAll(".note-open").length === 6'), "return to page two before searching");
    await evaluate('document.querySelector(".search-bar input").focus()');
    await window.webContents.insertText("needle-body-42");
    await until(async () => {
      const names = await visibleNames();
      return names.length === 1 && names[0] === fixtureNames[1];
    }, "search from page two resets pagination and filters by note body");
    assert.equal(await evaluate('Boolean(document.querySelector(".history-pagination"))'), false);
    await evaluate('document.querySelector(".search-bar input").select()');
    await window.webContents.insertText("no-such-query-98231");
    await until(() => evaluate('Boolean(document.querySelector(".history-empty")) && !document.querySelector(".history-error")'), "unmatched query shows an empty result");
    await evaluate('document.querySelector(".search-bar input").select()');
    await key("Backspace");
    await until(() => evaluate('document.querySelector(".search-bar input").value === "" && document.querySelectorAll(".note-open").length === 24'), "clearing search restores the first page");
    console.log("Packaged history query regression passed: separate pages, filename/body search, UI navigation, empty results and clearing search.");

    // Settings must report conflicts without overwriting the working configuration.
    await until(() => evaluate('window.szeptucha.getShortcutState().then(Boolean)'), "startup shortcut state");
    const originalSettingsFile = fs.readFileSync(path.join(directory, "settings.json"), "utf8");
    const originalShortcutState = await evaluate('window.szeptucha.getShortcutState()');
    assert.equal(await evaluate('(async () => { const s = await window.szeptucha.getSettings(); try { await window.szeptucha.saveSettings({ ...s, recordHotkey: "Ctrl+F6", correctHotkey: "Control+F6" }); return false; } catch (error) { return String(error).includes("SHORTCUT_CONFLICT"); } })()'),
      true, "IPC rejects equivalent shortcut aliases");
    assert.equal(fs.readFileSync(path.join(directory, "settings.json"), "utf8"), originalSettingsFile);
    assert.deepEqual(await evaluate('window.szeptucha.getShortcutState()'), originalShortcutState);

    await evaluate('document.querySelectorAll("aside nav button")[3].click()');
    await until(() => evaluate('document.querySelectorAll(".hotkey-recorder input").length === 2'), "shortcut settings");
    const originalShortcutDisplays = await evaluate('Array.from(document.querySelectorAll(".hotkey-recorder input"), input => input.value)');
    await evaluate('document.querySelectorAll(".hotkey-recorder input")[0].focus()');
    await key("Tab");
    assert.equal(await evaluate('document.activeElement === document.querySelectorAll(".hotkey-recorder input")[1]'), true,
      "Tab leaves the recording shortcut and reaches the correction shortcut");
    assert.equal(await evaluate('document.querySelectorAll(".hotkey-recorder input")[0].value'), originalShortcutDisplays[0],
      "Tab must not overwrite the recording shortcut");
    await key("Tab");
    assert.equal(await evaluate('document.activeElement.tagName === "SELECT" && Boolean(document.activeElement.querySelector("option[value=system]"))'), true,
      "Tab leaves the correction shortcut and reaches the language selector");
    assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".hotkey-recorder input"), input => input.value)'), originalShortcutDisplays,
      "forward traversal does not change either shortcut");

    // Clear buttons are part of the natural reverse tab order when not capturing.
    let returnedToRecording = false;
    for (let i = 0; i < 6; i += 1) {
      await key("Tab", ["shift"]);
      if (await evaluate('document.activeElement === document.querySelectorAll(".hotkey-recorder input")[0]')) {
        returnedToRecording = true;
        break;
      }
    }
    assert.equal(returnedToRecording, true, "Shift+Tab traverses both shortcut fields without trapping focus");
    await key("Tab", ["shift"]);
    assert.equal(await evaluate('document.activeElement === document.querySelector(".key button")'), true,
      "Shift+Tab leaves the recording shortcut toward the previous control");
    assert.deepEqual(await evaluate('Array.from(document.querySelectorAll(".hotkey-recorder input"), input => input.value)'), originalShortcutDisplays,
      "reverse traversal does not record Shift+Tab");
    assert.equal(fs.readFileSync(path.join(directory, "settings.json"), "utf8"), originalSettingsFile);
    console.log("Packaged shortcut Tab navigation passed: forward/reverse focus traversal preserves both shortcut values.");
    await evaluate('document.querySelectorAll(".hotkey-recorder input")[0].focus()');
    await key("F8", ["control", "alt"]);
    await evaluate('document.querySelectorAll(".hotkey-recorder input")[1].focus()');
    await key("F8", ["control", "alt"]);
    await evaluate('document.querySelector("#settings > button.primary").click()');
    await until(() => evaluate('document.querySelector(".settings-save-error")?.textContent.includes("must use different shortcuts")'), "localized duplicate error");
    assert.equal(fs.readFileSync(path.join(directory, "settings.json"), "utf8"), originalSettingsFile, "duplicate UI save preserves disk settings");

    // This combination is owned by OCR or reserved by Windows; it cannot be taken over.
    await evaluate('document.querySelectorAll(".hotkey-recorder input")[0].focus()');
    await key("Q", ["meta", "shift"]);
    await evaluate('document.querySelectorAll(".hotkey-recorder")[1].querySelector(".clear-btn").click()');
    await evaluate('document.querySelector("#settings > button.primary").click()');
    await until(() => evaluate('document.querySelector(".shortcut-warning")?.textContent.includes("unavailable")'), "persistent unavailable shortcut warning");
    const shortcutState = await evaluate('window.szeptucha.getShortcutState()');
    assert.equal(shortcutState.recording.accelerator, "Super+Shift+Q", "Win must not be captured as Control");
    assert.equal(shortcutState.recording.status, "unavailable");
    assert.equal(shortcutState.correction.status, "disabled");
    assert.equal(await evaluate('Boolean(document.querySelector(".settings-save-error"))'), false, "unavailable shortcuts still allow saving other settings");
    await evaluate('document.querySelectorAll("aside nav button")[0].click()');
    await evaluate('document.querySelectorAll("aside nav button")[3].click()');
    await until(() => evaluate('Boolean(document.querySelector(".shortcut-warning"))'), "warning survives leaving settings");
    await evaluate('document.querySelectorAll(".hotkey-recorder")[0].querySelector(".clear-btn").click()');
    await evaluate('document.querySelector("#settings > button.primary").click()');
    await until(() => evaluate('window.szeptucha.getShortcutState().then(s => s.recording.status === "disabled" && s.correction.status === "disabled")'), "disabled shortcuts recover cleanly");
    assert.equal(await evaluate('Boolean(document.querySelector(".shortcut-warning"))'), false);
    console.log("Packaged shortcut settings passed: duplicate rejection, unchanged configuration, Win modifier capture, unavailable warning and disabled recovery.");
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
