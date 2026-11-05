const fs = require("node:fs");
const path = require("node:path");

function createNoteFiles({ getFolder, trashItem, noteText, maxReadBytes }) {
  async function noteFilePath(fileName) {
    if (typeof fileName !== "string" || !fileName || path.basename(fileName) !== fileName) {
      throw new Error("Invalid note name");
    }
    const ext = path.extname(fileName).toLowerCase();
    if (![".md", ".txt", ".json"].includes(ext)) throw new Error("Invalid note type");
    const folderPath = getFolder();
    if (!folderPath) throw new Error("Notes folder is unavailable");
    const filePath = path.resolve(folderPath, fileName);
    const stat = await fs.promises.lstat(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Invalid note file");
    return { filePath, stat, format: ext.slice(1) };
  }

  async function readNote(fileName) {
    const { filePath, stat, format } = await noteFilePath(fileName);
    if (stat.size > maxReadBytes) throw new Error("Note is too large to open");
    return noteText(await fs.promises.readFile(filePath, "utf8"), format);
  }

  async function deleteNote(fileName) {
    let filePath;
    try {
      ({ filePath } = await noteFilePath(fileName));
    } catch (error) {
      if (error.code === "ENOENT") return false;
      throw error;
    }
    // A trash failure must leave the note in place; never fall back to unlink.
    await trashItem(filePath);
    return true;
  }
  return { readNote, deleteNote };
}

module.exports = { createNoteFiles };
