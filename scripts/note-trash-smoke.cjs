const { app, shell } = require("electron");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const path = require("node:path");
const timeout = setTimeout(() => { console.error("Note trash smoke test timed out"); app.exit(1); }, 30_000);

app.whenReady().then(async () => {
  let directory;
  let exitCode = 0;
  try {
    const archive = process.argv[2];
    assert.ok(archive, "Pass the installed app.asar path");
    const { createNoteFiles } = require(path.join(archive, "electron", "note-files.cjs"));
    directory = await fs.mkdtemp(path.join(app.getPath("temp"), "SzeptuchaTrashSmoke-"));
    const name = "notatka-żółw.txt";
    const file = path.join(directory, name);
    await fs.writeFile(file, "Disposable CI fixture for the Windows Recycle Bin smoke test.");
    const notes = createNoteFiles({
      getFolder: () => directory,
      trashItem: item => shell.trashItem(item),
      noteText: text => text,
      maxReadBytes: 1024,
    });
    assert.equal(await notes.deleteNote(name), true);
    await assert.rejects(fs.stat(file), { code: "ENOENT" });
    assert.equal(await notes.deleteNote(name), false);
    console.log("Packaged note files moved a Unicode filename through the Windows Recycle Bin API.");
  } catch (error) {
    console.error(error);
    exitCode = 1;
  } finally {
    if (directory) await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    clearTimeout(timeout);
    app.exit(exitCode);
  }
});
