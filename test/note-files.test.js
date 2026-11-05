const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { createNoteFiles } = require("../electron/note-files.cjs");

async function fixture(t, trashItem) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "szeptucha-note-files-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const notes = path.join(root, "notes");
  const trash = path.join(root, "trash");
  await fs.mkdir(notes);
  await fs.mkdir(trash);
  const calls = [];
  let folder = notes;
  const files = createNoteFiles({
    getFolder: () => folder,
    trashItem: async file => {
      calls.push(file);
      if (trashItem) return trashItem(file);
      await fs.rename(file, path.join(trash, path.basename(file)));
    },
    noteText: (text, format) => format === "json" ? JSON.parse(text).text : text,
    maxReadBytes: 100,
  });
  return { root, notes, trash, calls, files, setFolder: value => { folder = value; } };
}

test("moves supported Unicode note files through the trash API and preserves their contents", async t => {
  const { notes, trash, calls, files } = await fixture(t);
  for (const ext of ["md", "txt", "json"]) {
    const name = `Żółw i szept.${ext}`;
    const content = ext === "json" ? '{"text":"Zażółć gęślą jaźń"}' : "Zażółć gęślą jaźń";
    await fs.writeFile(path.join(notes, name), content);
    assert.equal(await files.deleteNote(name), true);
    await assert.rejects(fs.stat(path.join(notes, name)), { code: "ENOENT" });
    assert.equal(await fs.readFile(path.join(trash, name), "utf8"), content);
    assert.equal(calls.at(-1), path.resolve(notes, name));
  }
});

test("does not report success before the trash operation finishes", async t => {
  let finish;
  let signalStarted;
  const started = new Promise(resolve => { signalStarted = resolve; });
  const state = await fixture(t, file => new Promise(resolve => {
    finish = async () => { await fs.rename(file, path.join(state.trash, "note.txt")); resolve(); };
    signalStarted();
  }));
  await fs.writeFile(path.join(state.notes, "note.txt"), "keep me");
  let settled = false;
  const deletion = state.files.deleteNote("note.txt").then(value => { settled = true; return value; });
  await started;
  assert.equal(settled, false);
  assert.equal(await fs.readFile(path.join(state.notes, "note.txt"), "utf8"), "keep me");
  await finish();
  assert.equal(await deletion, true);
});

test("trash failures preserve the note and propagate the error, including ENOENT from the trash service", async t => {
  for (const code of ["EACCES", "ENOENT"]) {
    const error = Object.assign(new Error("Trash unavailable"), { code });
    const { notes, files } = await fixture(t, async () => { throw error; });
    await fs.writeFile(path.join(notes, "note.txt"), "keep me");
    await assert.rejects(files.deleteNote("note.txt"), candidate => candidate === error);
    assert.equal(await fs.readFile(path.join(notes, "note.txt"), "utf8"), "keep me");
  }
});

test("an already missing note returns false without calling the trash service", async t => {
  const { calls, files } = await fixture(t);
  assert.equal(await files.deleteNote("missing.txt"), false);
  assert.deepEqual(calls, []);
});

test("rejects paths outside the notes folder, unsupported files and directories", async t => {
  const { root, notes, files, calls, setFolder } = await fixture(t);
  await fs.writeFile(path.join(root, "outside.txt"), "keep outside");
  await fs.writeFile(path.join(notes, "settings.exe"), "keep unsupported");
  await fs.mkdir(path.join(notes, "folder.txt"));
  for (const name of ["../outside.txt", path.join(root, "outside.txt"), "settings.exe", "folder.txt", "", null]) {
    await assert.rejects(files.deleteNote(name), /Invalid note/);
  }
  setFolder("");
  await assert.rejects(files.deleteNote("note.txt"), /folder is unavailable/);
  assert.deepEqual(calls, []);
  assert.equal(await fs.readFile(path.join(root, "outside.txt"), "utf8"), "keep outside");
});

test("rejects symbolic links without touching their target", { skip: process.platform === "win32" }, async t => {
  const { root, notes, files, calls } = await fixture(t);
  const target = path.join(root, "outside.txt");
  await fs.writeFile(target, "keep outside");
  await fs.symlink(target, path.join(notes, "link.txt"));
  await assert.rejects(files.deleteNote("link.txt"), /Invalid note file/);
  assert.deepEqual(calls, []);
  assert.equal(await fs.readFile(target, "utf8"), "keep outside");
});

test("reading notes preserves format parsing and the size limit after extraction", async t => {
  const { notes, files } = await fixture(t);
  await fs.writeFile(path.join(notes, "note.json"), '{"text":"hello"}');
  assert.equal(await files.readNote("note.json"), "hello");
  await fs.writeFile(path.join(notes, "note.txt"), "x".repeat(101));
  await assert.rejects(files.readNote("note.txt"), /too large/);
});
