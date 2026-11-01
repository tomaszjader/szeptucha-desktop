const fs = require("node:fs/promises");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const ID = /^[0-9a-f-]{36}$/;

function createRecordingDrafts({ directory }) {
  const manifestPath = path.join(directory, "recording.json");
  let queue = Promise.resolve();
  const serialize = operation => {
    const next = queue.then(operation);
    queue = next.catch(() => {});
    return next;
  };
  const audioPath = id => path.join(directory, `${id}.audio`);
  async function manifest() {
    try {
      const stat = await fs.lstat(manifestPath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 2 * 1024 * 1024) throw new Error("Invalid draft metadata");
      const data = JSON.parse(await fs.readFile(manifestPath, "utf8"));
      if (data.version !== 1 || !ID.test(data.id) || !Number.isSafeInteger(data.size) || data.size <= 0 || data.size > MAX_AUDIO_BYTES ||
          typeof data.mime !== "string" || !/^audio\/[\w.+-]+(?:;[^\r\n]*)?$/.test(data.mime) || data.mime.length > 200 ||
          !Number.isFinite(data.durationMs) || data.durationMs < 0 || !Number.isFinite(data.startedAt)) throw new Error("Invalid draft metadata");
      if (data.result && (typeof data.result.text !== "string" || data.result.text.length > 1_000_000 || typeof data.result.path !== "string")) throw new Error("Invalid draft result");
      return data;
    } catch (error) { if (error.code === "ENOENT") return null; throw error; }
  }
  async function atomic(file, bytes) {
    const temp = `${file}.tmp`;
    let handle;
    try {
      handle = await fs.open(temp, "w", 0o600);
      await handle.writeFile(bytes);
      await handle.sync();
      await handle.close(); handle = null;
      await fs.rename(temp, file);
    } finally {
      await handle?.close();
      await fs.unlink(temp).catch(() => {});
    }
  }
  function metadata(id, size, meta) {
    if (!meta || typeof meta.mime !== "string" || !/^audio\/[\w.+-]+(?:;[^\r\n]*)?$/.test(meta.mime) || meta.mime.length > 200 ||
        !Number.isFinite(meta.startedAt) || !Number.isFinite(meta.durationMs) || meta.durationMs < 0) throw new Error("Invalid recording metadata");
    return { version: 1, id, size, mime: meta.mime, startedAt: meta.startedAt, durationMs: meta.durationMs };
  }
  async function currentFor(id) {
    const old = await manifest();
    if (old && old.id !== id) throw new Error("Another recording draft exists");
    return old;
  }
  function bytes(data) {
    if (!(data instanceof ArrayBuffer || ArrayBuffer.isView(data)) || !data.byteLength || data.byteLength > MAX_AUDIO_BYTES) throw new Error("Invalid draft audio");
    return data instanceof ArrayBuffer ? Buffer.from(data) : Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  }
  return {
    load: () => serialize(async () => {
      const data = await manifest();
      const files = await fs.readdir(directory).catch(error => { if (error.code === "ENOENT") return []; throw error; });
      for (const file of files) {
        if ((/^[0-9a-f-]{36}\.audio(?:\.tmp)?$/.test(file) || file === "recording.json.tmp") && file !== `${data?.id}.audio`) {
          await fs.unlink(path.join(directory, file));
        }
      }
      if (!data) return null;
      const stat = await fs.lstat(audioPath(data.id));
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size < data.size || stat.size > MAX_AUDIO_BYTES) throw new Error("Invalid draft audio file");
      // Only recover committed chunks, ignoring an incomplete trailing write.
      const handle = await fs.open(audioPath(data.id), "r");
      try {
        const audio = Buffer.alloc(data.size);
        let offset = 0;
        while (offset < audio.length) {
          const { bytesRead } = await handle.read(audio, offset, audio.length - offset, offset);
          if (!bytesRead) throw new Error("Incomplete draft audio");
          offset += bytesRead;
        }
        return { ...data, audio };
      } finally { await handle.close(); }
    }),
    append: (id, data, meta) => serialize(async () => {
      const chunk = bytes(data);
      const old = await currentFor(id);
      id = old?.id || randomUUID();
      const size = (old?.size || 0) + chunk.length;
      if (size > MAX_AUDIO_BYTES) throw new Error("Recording draft is too large");
      const nextMeta = metadata(id, size, meta);
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      const handle = await fs.open(audioPath(id), "a+", 0o600);
      try {
        await handle.truncate(old?.size || 0);
        await handle.writeFile(chunk);
        await handle.sync();
        await atomic(manifestPath, JSON.stringify(nextMeta));
        return id;
      } catch (error) {
        await handle.truncate(old?.size || 0).catch(() => {});
        throw error;
      } finally { await handle.close(); }
    }),
    save: (id, data, meta) => serialize(async () => {
      const audio = bytes(data);
      const old = await currentFor(id);
      id = old?.id || randomUUID();
      const nextMeta = metadata(id, audio.length, meta);
      await fs.mkdir(directory, { recursive: true, mode: 0o700 });
      await atomic(audioPath(id), audio);
      await atomic(manifestPath, JSON.stringify(nextMeta));
      return id;
    }),
    saveResult: (id, result) => serialize(async () => {
      const old = await currentFor(id);
      if (!old || typeof result?.text !== "string" || result.text.length > 1_000_000 || typeof result.path !== "string") throw new Error("Invalid draft result");
      await atomic(manifestPath, JSON.stringify({ ...old, result: { text: result.text, path: result.path } }));
    }),
    clear: id => serialize(async () => {
      const old = await currentFor(id);
      if (!ID.test(id || "")) throw new Error("Invalid recording ID");
      // Remove the pointer first; startup cleanup removes any orphan after a crash here.
      if (old) await fs.unlink(manifestPath);
      await fs.unlink(audioPath(id)).catch(error => { if (error.code !== "ENOENT") throw error; });
    }),
  };
}
module.exports = { createRecordingDrafts };
