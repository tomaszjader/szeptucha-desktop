const test = require("node:test");
const assert = require("node:assert/strict");
const { createShortcutCapture } = require("../electron/shortcut-capture.cjs");

function fixture() {
  let suspended = false;
  const calls = [];
  const capture = createShortcutCapture({ globalShortcut: {
    setSuspended(value) { suspended = value; calls.push(value); },
  } });
  return { capture, calls, suspended: () => suspended };
}

test("capture suspends global handling and acceptance/cancellation resumes it", () => {
  const f = fixture();
  assert.equal(f.capture.begin("input-1"), true);
  assert.equal(f.suspended(), true);
  f.capture.end("input-1");
  assert.equal(f.suspended(), false);
  assert.deepEqual(f.calls, [true, false]);
});

test("stale cleanup from the previous input does not resume the current capture", () => {
  const f = fixture();
  f.capture.begin("input-1");
  f.capture.begin("input-2");
  f.capture.end("input-1");
  assert.equal(f.suspended(), true);
  f.capture.end("input-2");
  assert.equal(f.suspended(), false);
});

test("window lifecycle reset resumes shortcuts and invalidates late cleanup", () => {
  const f = fixture();
  f.capture.begin("old-input");
  f.capture.reset();
  f.capture.reset();
  assert.deepEqual(f.calls, [true, false]);
  f.capture.begin("new-input");
  f.capture.end("old-input");
  assert.equal(f.suspended(), true);
  f.capture.end("new-input");
  assert.equal(f.suspended(), false);
});

test("invalid capture tokens do not affect global handling", () => {
  const f = fixture();
  for (const token of [undefined, null, {}, "", "a".repeat(101), "not a token"]) {
    assert.equal(f.capture.begin(token), false);
  }
  assert.deepEqual(f.calls, []);
});

test("settings registration runs unsuspended and then restores capture mode", () => {
  const f = fixture();
  f.capture.begin("input-1");
  const value = f.capture.withRegistration(() => {
    assert.equal(f.suspended(), false, "Electron registration must be allowed");
    return "registered";
  });
  assert.equal(value, "registered");
  assert.equal(f.suspended(), true);
  f.capture.end("input-1");
  assert.equal(f.suspended(), false);
});

test("a registration failure also restores the active capture", () => {
  const f = fixture();
  f.capture.begin("input-1");
  assert.throws(() => f.capture.withRegistration(() => { throw new Error("registration failed"); }), /registration failed/);
  assert.equal(f.suspended(), true);
  f.capture.reset();
  assert.equal(f.suspended(), false);
});

test("normal registration does not suspend shortcuts when no input is editing", () => {
  const f = fixture();
  f.capture.withRegistration(() => assert.equal(f.suspended(), false));
  assert.deepEqual(f.calls, []);
});
