const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createRecordingDrafts } = require("../electron/recording-drafts.cjs");
const { createRecordingController } = require("../electron/recording-controller.cjs");
const meta = { mime: "audio/webm;codecs=opus", startedAt: 1000, durationMs: 1000 };

async function fixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "szeptucha-draft-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, store: createRecordingDrafts({ directory }) };
}
function adapter(store) {
  return {
    load: async () => { const data = await store.load(); return data && { ...data, blob: new Blob([data.audio], { type: data.mime }) }; },
    append: async (id, blob, data) => store.append(id, await blob.arrayBuffer(), data),
    save: async (id, blob, data) => store.save(id, await blob.arrayBuffer(), data),
    saveResult: (id, result) => store.saveResult(id, result),
    clear: id => store.clear(id),
  };
}
function controller(drafts, { transcribe = async () => ({ text: "recognized", path: "note.md" }), complete = async () => {} } = {}) {
  let recorder;
  let captures = 0;
  const recording = createRecordingController({
    drafts, now: () => 5000,
    getUserMedia: async () => { captures++; return { getTracks: () => [{ stop() {} }] }; },
    createMediaRecorder: () => {
      recorder = {
        state: "inactive", mimeType: "audio/webm",
        start(interval) { assert.equal(interval, 1000); this.state = "recording"; },
        chunk(text) { this.ondataavailable?.({ data: new Blob([text], { type: this.mimeType }) }); },
        stop() { this.state = "inactive"; this.chunk("tail"); this.onstop?.(); },
      };
      return recorder;
    },
    transcribe, complete, onState() {}, onError() {},
  });
  return { recording, get recorder() { return recorder; }, get captures() { return captures; } };
}
function waitFor(recording, predicate) {
  if (predicate(recording.getState())) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { unsubscribe(); reject(new Error("State did not arrive")); }, 2000);
    const unsubscribe = recording.subscribe(state => { if (predicate(state)) { clearTimeout(timer); unsubscribe(); resolve(); } });
  });
}

test("append survives a new store instance and ignores an uncommitted trailing write", async t => {
  const { directory, store } = await fixture(t);
  const id = await store.append(null, Buffer.from("header"), meta);
  await store.append(id, Buffer.from("audio"), { ...meta, durationMs: 2000 });
  await fs.appendFile(path.join(directory, `${id}.audio`), "partial write");
  const recovered = await createRecordingDrafts({ directory }).load();
  assert.equal(recovered.audio.toString(), "headeraudio");
  assert.equal(recovered.durationMs, 2000);
  await store.clear(id);
  assert.equal(await store.load(), null);
  assert.deepEqual(await fs.readdir(directory), []);
});

test("full save, saved text and cleanup survive restart; another draft cannot overwrite it", async t => {
  const { directory, store } = await fixture(t);
  const id = await store.save(null, Buffer.from("complete audio"), meta);
  await store.saveResult(id, { text: "already transcribed", path: "note.md" });
  const recovered = await createRecordingDrafts({ directory }).load();
  assert.equal(recovered.result.text, "already transcribed");
  await assert.rejects(store.save(null, Buffer.from("replacement"), meta), /Another recording/);
  await assert.rejects(store.clear("../../other"), /Another recording/);
  assert.equal((await store.load()).audio.toString(), "complete audio");
  await store.clear(id);
  assert.equal(await store.load(), null);
});

test("corrupt or missing data is reported without deleting the draft", async t => {
  const { directory, store } = await fixture(t);
  const id = await store.save(null, Buffer.from("audio"), meta);
  const manifestPath = path.join(directory, "recording.json");
  const original = await fs.readFile(manifestPath, "utf8");
  await fs.writeFile(manifestPath, "{broken");
  await assert.rejects(store.load());
  assert.equal(await fs.readFile(path.join(directory, `${id}.audio`), "utf8"), "audio");
  await fs.writeFile(manifestPath, original);
  await fs.truncate(path.join(directory, `${id}.audio`), 1);
  await assert.rejects(store.load(), /Invalid draft audio/);
  assert.equal(await fs.readFile(manifestPath, "utf8"), original);
});

test("startup cleans orphan audio and temporary files but preserves unrelated files", async t => {
  const { directory, store } = await fixture(t);
  const orphan = "00000000-0000-0000-0000-000000000000.audio";
  await fs.writeFile(path.join(directory, orphan), "old audio");
  await fs.writeFile(path.join(directory, "recording.json.tmp"), "partial metadata");
  await fs.writeFile(path.join(directory, "keep.txt"), "unrelated");
  assert.equal(await store.load(), null);
  assert.deepEqual(await fs.readdir(directory), ["keep.txt"]);
});

test("a fresh controller offers periodic audio from a crashed recording without capturing or calling API", async t => {
  const { directory, store } = await fixture(t);
  const first = controller(adapter(store));
  await first.recording.restore();
  await first.recording.toggle("shortcut");
  first.recorder.chunk("unfinished audio");
  await waitFor(first.recording, state => state.draftSaved);
  const second = controller(adapter(createRecordingDrafts({ directory })), { transcribe: () => assert.fail("No automatic API call") });
  await second.recording.restore();
  assert.equal(second.captures, 0);
  assert.equal(second.recording.getState().error, "RECORDING_RECOVERED");
  assert.equal(second.recording.getState().source, "interface");
  assert.equal(await second.recording.getRetainedAudio().text(), "unfinished audio");
  assert.equal(await second.recording.discard(), true);
  assert.equal(await store.load(), null);
});

test("successful retry removes the durable backup only after completion", async t => {
  const { directory, store } = await fixture(t);
  let attempts = 0;
  const first = controller(adapter(store), { transcribe: async () => { attempts++; throw new Error("offline"); } });
  await first.recording.restore();
  await first.recording.toggle();
  first.recorder.chunk("original");
  await first.recording.toggle();
  assert.equal(first.recording.getState().canRetry, true);
  const saved = await store.load();
  assert.equal(saved.audio.toString(), "originaltail");
  const second = controller(adapter(createRecordingDrafts({ directory })), {
    transcribe: async blob => { attempts++; assert.equal(await blob.text(), "originaltail"); return { text: "recovered", path: "note.md" }; },
    complete: async () => assert.equal((await store.load()).result.text, "recovered"),
  });
  await second.recording.restore();
  await second.recording.retry();
  assert.equal(attempts, 2);
  assert.equal(await store.load(), null);
  assert.equal(second.recording.getState().phase, "completed");
});

test("restoring a saved transcription after a completion failure avoids another API call", async t => {
  const { directory, store } = await fixture(t);
  const first = controller(adapter(store), { complete: async () => { throw new Error("paste failed"); } });
  await first.recording.restore();
  await first.recording.toggle(); await first.recording.toggle();
  assert.equal((await store.load()).result.text, "recognized");
  let completed = false;
  const second = controller(adapter(createRecordingDrafts({ directory })), {
    transcribe: () => assert.fail("Must use the saved text"),
    complete: async result => { completed = true; assert.equal(result.text, "recognized"); },
  });
  await second.recording.restore(); await second.recording.retry();
  assert.equal(completed, true);
  assert.equal(await store.load(), null);
});

test("disk save and removal errors retain the in-memory audio and can be retried", async t => {
  const { store } = await fixture(t);
  const drafts = adapter(store);
  let failSave = true;
  let failClear = true;
  let calls = 0;
  const recording = controller({ ...drafts,
    save: (...args) => { if (failSave) throw new Error("disk full"); return drafts.save(...args); },
    clear: (...args) => { if (failClear) throw new Error("access denied"); return drafts.clear(...args); },
  }, { transcribe: async () => { calls++; return { text: "text", path: "note.md" }; } }).recording;
  await recording.restore(); await recording.toggle(); await recording.toggle();
  assert.equal(recording.getState().error, "DRAFT_SAVE_FAILED");
  assert.equal(calls, 0);
  assert.equal(await recording.getRetainedAudio().text(), "tail");
  failSave = false;
  await recording.retry();
  assert.equal(recording.getState().error, "DRAFT_DELETE_FAILED");
  assert.equal(calls, 1);
  assert.equal(await recording.discard(), false);
  failClear = false;
  await recording.retry();
  assert.equal(calls, 1);
  assert.equal(await store.load(), null);
});

test("loading blocks a new capture and failed recovery does not overwrite old audio", async () => {
  let finish;
  let first = true;
  const h = controller({ load: () => { if (first) { first = false; return new Promise(resolve => { finish = resolve; }); } throw new Error("disk unavailable"); } });
  const restoring = h.recording.restore();
  await h.recording.toggle();
  assert.equal(h.captures, 0);
  finish(null); await restoring;
  await h.recording.restore();
  assert.equal(h.recording.getState().recoveryFailed, true);
  await h.recording.toggle();
  assert.equal(h.captures, 0);
});
