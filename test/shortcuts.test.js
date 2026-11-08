const test = require("node:test");
const assert = require("node:assert/strict");
const { canonicalAccelerator, createShortcutManager } = require("../electron/shortcuts.cjs");

function fixture() {
  const registered = new Map([["Super+Shift+Q", () => {}]]);
  const attempted = [];
  const removed = [];
  const unavailable = new Set();
  const invalid = new Set();
  const updates = [];
  const invoked = [];
  const manager = createShortcutManager({
    globalShortcut: {
      isRegistered: value => registered.has(value),
      register(value, callback) {
        attempted.push(value);
        if (invalid.has(value)) throw new Error("Invalid accelerator");
        if (unavailable.has(value)) return false;
        registered.set(value, callback);
        return true;
      },
      unregister(value) { removed.push(value); registered.delete(value); },
    },
    platform: "win32",
    actions: { recording: () => invoked.push("recording"), correction: () => invoked.push("correction") },
    onState: state => updates.push(state),
    logger: { error() {} },
  });
  return { manager, registered, attempted, removed, unavailable, invalid, updates, invoked };
}

const settings = { recordHotkey: "CommandOrControl+Shift+R", correctHotkey: "CommandOrControl+Q" };

test("recognizes equivalent modifier aliases, ordering, case and Plus keys on the target platform", () => {
  assert.equal(canonicalAccelerator("Shift+Ctrl+R", "win32"), canonicalAccelerator("CommandOrControl+shift+r", "win32"));
  assert.equal(canonicalAccelerator("Control+Q", "win32"), canonicalAccelerator("CmdOrCtrl+q", "win32"));
  assert.equal(canonicalAccelerator("Cmd+Q", "darwin"), canonicalAccelerator("CommandOrControl+q", "darwin"));
  assert.notEqual(canonicalAccelerator("Ctrl+Q", "darwin"), canonicalAccelerator("CommandOrControl+q", "darwin"));
  assert.equal(canonicalAccelerator("Ctrl++"), canonicalAccelerator("Control+Plus"));
  assert.equal(canonicalAccelerator("Alt+Return"), canonicalAccelerator("Option+Enter"));
  assert.equal(canonicalAccelerator(""), "");
});

test("rejects duplicate settings before changing registered shortcuts or publishing status", () => {
  const f = fixture();
  f.manager.apply(settings);
  const before = f.manager.getState();
  assert.throws(() => f.manager.validate({ recordHotkey: "Ctrl+Shift+R", correctHotkey: "shift+Control+r" }), /SHORTCUT_CONFLICT/);
  assert.deepEqual(f.manager.getState(), before);
  assert.equal(f.removed.length, 0);
  assert.equal(f.updates.length, 1);
  assert.equal(f.registered.size, 3);
});

test("registers actions, publishes active status and invokes the appropriate callback", () => {
  const f = fixture();
  assert.equal(f.manager.getState(), null);
  const state = f.manager.apply(settings);
  assert.equal(state.recording.status, "active");
  assert.equal(state.correction.status, "active");
  f.registered.get(settings.recordHotkey)();
  f.registered.get(settings.correctHotkey)();
  assert.deepEqual(f.invoked, ["recording", "correction"]);
  assert.deepEqual(f.updates[0], state);
  state.recording.status = "unavailable";
  assert.equal(f.manager.getState().recording.status, "active", "caller cannot mutate stored status");
});

test("reports failed and throwing registrations while allowing the other action to work", () => {
  for (const mode of ["unavailable", "invalid"]) {
    const f = fixture();
    f[mode].add(settings.recordHotkey);
    const state = f.manager.apply(settings);
    assert.equal(state.recording.status, "unavailable");
    assert.equal(state.correction.status, "active");
    assert.equal(f.registered.has(settings.recordHotkey), false);
  }
});

test("changing settings releases only owned shortcuts and preserves OCR or other app registrations", () => {
  const f = fixture();
  f.manager.apply(settings);
  const state = f.manager.apply({ recordHotkey: "Super+Shift+Q", correctHotkey: "" });
  assert.deepEqual(f.removed, [settings.recordHotkey, settings.correctHotkey]);
  assert.equal(f.registered.has("Super+Shift+Q"), true);
  assert.equal(f.attempted.includes("Super+Shift+Q"), false);
  assert.equal(state.recording.status, "unavailable");
  assert.equal(state.correction.status, "disabled");
});

test("existing duplicate settings are reported as conflicts and neither action silently wins", () => {
  const f = fixture();
  const state = f.manager.apply({ recordHotkey: "Ctrl+Q", correctHotkey: "Control+Q" });
  assert.equal(state.recording.status, "conflict");
  assert.equal(state.correction.status, "conflict");
  assert.deepEqual(f.attempted, []);
});

test("cleared shortcuts are disabled and do not conflict, and failed registrations can be retried", () => {
  const f = fixture();
  assert.doesNotThrow(() => f.manager.validate({ recordHotkey: "", correctHotkey: "" }));
  assert.equal(f.manager.apply({ recordHotkey: "", correctHotkey: "" }).recording.status, "disabled");
  f.unavailable.add(settings.recordHotkey);
  assert.equal(f.manager.apply(settings).recording.status, "unavailable");
  f.unavailable.clear();
  assert.equal(f.manager.apply(settings).recording.status, "active");
});
