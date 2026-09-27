const fs = require('node:fs');
const path = require('node:path');

const MAX_STATE_BYTES = 10 * 1024 * 1024;

function serializeAppState(state) {
  if (!Array.isArray(state.history)) {
    const serialized = `${JSON.stringify(state)}\n`;
    if (Buffer.byteLength(serialized, 'utf8') > MAX_STATE_BYTES) throw new Error('Stan aplikacji przekracza limit rozmiaru.');
    return serialized;
  }

  // Keep the newest entries that fit. A single oversized OCR result must not
  // prevent settings and smaller history entries from being restored.
  const savedHistory = [];
  let bytes = Buffer.byteLength(`${JSON.stringify({ ...state, history: [] })}\n`, 'utf8');
  if (bytes > MAX_STATE_BYTES) throw new Error('Ustawienia aplikacji przekraczają limit rozmiaru.');
  for (const entry of state.history) {
    const entryBytes = Buffer.byteLength(JSON.stringify(entry), 'utf8') + (savedHistory.length ? 1 : 0);
    if (bytes + entryBytes > MAX_STATE_BYTES) continue;
    savedHistory.push(entry);
    bytes += entryBytes;
  }
  return `${JSON.stringify({ ...state, history: savedHistory })}\n`;
}

function readAppState(filePath) {
  try {
    if (fs.statSync(filePath).size > MAX_STATE_BYTES) return {};
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    // A missing or damaged state file should never prevent the app from starting.
    return {};
  }
}

function writeAppState(filePath, state) {
  const directory = path.dirname(filePath);
  const temporaryPath = path.join(directory, `.${path.basename(filePath)}.${process.pid}.${Date.now()}.tmp`);
  const serialized = serializeAppState(state);

  fs.mkdirSync(directory, { recursive: true });
  try {
    fs.writeFileSync(temporaryPath, serialized, { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
    // On Windows this is best effort; the file remains readable if chmod is unsupported.
    try { fs.chmodSync(filePath, 0o600); } catch {}
  } finally {
    try { fs.rmSync(temporaryPath, { force: true }); } catch {}
  }
}

module.exports = { readAppState, writeAppState };
