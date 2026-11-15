const test = require("node:test");
const assert = require("node:assert/strict");
const formatter = import("../src/utils/formatShortcut.mjs");

test("Windows displays Control and the Windows key consistently across accelerator aliases", async () => {
  const { formatShortcut } = await formatter;
  assert.equal(formatShortcut("CommandOrControl+Shift+R", "Win32"), "Ctrl+Shift+R");
  assert.equal(formatShortcut("CmdOrCtrl+Q", "Win32"), "Ctrl+Q");
  for (const key of ["Super", "Meta", "Windows", "Win"]) {
    assert.equal(formatShortcut(`${key}+Shift+Q`, "Win32"), "Win+Shift+Q");
  }
  assert.equal(formatShortcut("Control+Alt+Shift+F9", "Win32"), "Ctrl+Alt+Shift+F9");
});

test("macOS resolves CommandOrControl to Command while retaining a physical Control key", async () => {
  const { formatShortcut } = await formatter;
  for (const platform of ["MacIntel", "darwin"]) {
    assert.equal(formatShortcut("CommandOrControl+Q", platform), "⌘+Q");
    assert.equal(formatShortcut("Control+Q", platform), "Ctrl+Q");
    for (const key of ["Command", "Cmd", "Super", "Meta"]) {
      assert.equal(formatShortcut(`${key}+Shift+Q`, platform), "⌘+Shift+Q");
    }
    assert.equal(formatShortcut("Control+Super+Alt+Q", platform), "Ctrl+⌘+Option+Q");
  }
});

test("Linux retains Super rather than displaying a Windows key", async () => {
  const { formatShortcut } = await formatter;
  assert.equal(formatShortcut("Super+Shift+Q", "Linux x86_64"), "Super+Shift+Q");
  assert.equal(formatShortcut("CommandOrControl+Alt+Q", "Linux x86_64"), "Ctrl+Alt+Q");
});

test("formatting handles token aliases without removing text from unrelated key names", async () => {
  const { formatShortcut } = await formatter;
  assert.equal(formatShortcut(" control + SHIFT + KeyR ", "Win32"), "Ctrl+Shift+R");
  assert.equal(formatShortcut("Ctrl+MediaPlayPause", "Win32"), "Ctrl+MediaPlayPause");
  assert.equal(formatShortcut("Ctrl++", "Win32"), "Ctrl++");
  assert.equal(formatShortcut("", "Win32"), "");
});
