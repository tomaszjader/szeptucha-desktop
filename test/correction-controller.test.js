const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createCorrectionController } = require("../electron/correction-controller.cjs");

function harness({ correct, keys, timeoutMs = 1000 } = {}) {
  let text = "previous clipboard";
  const sent = [];
  const states = [];
  const clipboard = { readText: () => text, writeText: value => { text = value; }, clear: () => { text = ""; } };
  const controller = createCorrectionController({
    clipboard, timeoutMs, wait: async () => {},
    keys: async (action, signal) => { sent.push(action); if (keys) return keys(action, signal, clipboard); if (action === "copy") text = "selected text"; },
    correct: correct || (async () => "corrected text"),
    onState: state => states.push(state),
  });
  return { controller, clipboard, sent, states };
}
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
const tick = () => new Promise(resolve => setImmediate(resolve));

test("corrects selection once and disables cancellation during paste dispatch", async () => {
  const h = harness({ keys: async (action, _, clipboard) => {
    if (action === "copy") clipboard.writeText("selected text");
    else {
      assert.equal(h.controller.getState().phase, "pasting");
      assert.equal(h.controller.cancel(), false);
    }
  } });
  assert.deepEqual(await h.controller.run({}), { ok: true });
  assert.deepEqual(h.sent, ["copy", "paste"]);
  assert.equal(h.clipboard.readText(), "corrected text");
  assert.equal(h.controller.getState().busy, false);
});

test("concurrent shortcut and interface calls share a single operation", async () => {
  const reply = deferred(); let calls = 0;
  const h = harness({ correct: async () => { calls++; return reply.promise; } });
  const first = h.controller.run({});
  await tick();
  assert.deepEqual(await h.controller.run({}), { ok: false, code: "CORRECTION_BUSY" });
  assert.equal(calls, 1);
  assert.deepEqual(h.sent, ["copy"]);
  reply.resolve("corrected");
  assert.equal((await first).ok, true);
});

test("cancel restores the previous clipboard and ignores a late answer, including after a new correction", async () => {
  const late = deferred(); let signal; let calls = 0;
  const h = harness({ correct: async options => { signal = options.signal; return ++calls === 1 ? late.promise : "fresh result"; } });
  const first = h.controller.run({});
  await tick();
  const oldSignal = signal;
  assert.equal(h.controller.cancel(), true);
  assert.deepEqual(await first, { ok: false, code: "CORRECTION_CANCELLED" });
  assert.equal(oldSignal.aborted, true);
  assert.equal(h.clipboard.readText(), "previous clipboard");
  assert.equal((await h.controller.run({})).ok, true);
  late.resolve("stale result");
  await tick();
  assert.equal(h.clipboard.readText(), "fresh result");
  assert.deepEqual(h.sent, ["copy", "copy", "paste"]);
});

test("deadline releases an unresponsive request without pasting", async () => {
  let signal;
  const h = harness({ timeoutMs: 10, correct: async options => { signal = options.signal; return new Promise(() => {}); } });
  assert.deepEqual(await h.controller.run({}), { ok: false, code: "CORRECTION_TIMEOUT" });
  assert.equal(signal.aborted, true);
  assert.equal(h.clipboard.readText(), "previous clipboard");
  assert.equal(h.controller.getState().busy, false);
  assert.deepEqual(h.sent, ["copy"]);
});

test("manual clipboard changes while waiting are preserved and block automatic paste", async () => {
  const reply = deferred(); const h = harness({ correct: () => reply.promise });
  const request = h.controller.run({});
  await tick();
  h.clipboard.writeText("new user text");
  reply.resolve("corrected");
  assert.deepEqual(await request, { ok: false, code: "CORRECTION_CLIPBOARD_CHANGED" });
  assert.equal(h.clipboard.readText(), "new user text");
  assert.deepEqual(h.sent, ["copy"]);
});

test("empty selection and provider failures restore the clipboard and release the lock", async () => {
  let apiCalls = 0;
  const empty = harness({ keys: async () => {}, correct: async () => { apiCalls++; } });
  assert.equal((await empty.controller.run({})).code, "CORRECTION_NO_SELECTION");
  assert.equal(apiCalls, 0);
  assert.equal(empty.clipboard.readText(), "previous clipboard");
  const failed = harness({ correct: async () => { throw new Error("provider error"); } });
  assert.equal((await failed.controller.run({})).code, "provider error");
  assert.equal(failed.clipboard.readText(), "previous clipboard");
  assert.equal(failed.controller.getState().busy, false);
});

test("application shutdown aborts correction and never pastes a late answer", async () => {
  const reply = deferred(); const h = harness({ correct: () => reply.promise });
  const request = h.controller.run({});
  await tick();
  h.controller.dispose();
  assert.equal((await request).code, "CORRECTION_CANCELLED");
  reply.resolve("late"); await tick();
  assert.deepEqual(h.sent, ["copy"]);
});
