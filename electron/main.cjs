const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  screen,
  shell,
  clipboard,
  safeStorage,
} = require("electron");
const path = require("path"),
  fs = require("fs"),
  { spawn } = require("child_process");
const ocr = require("./ocr/main/main.js");
let win,
  recordingIndicator,
  tray,
  recording = false,
  recordingBusy = false,
  pasteTranscription = false;
let registeredHotkeys = [];
let activeNotesRequest = null;
const configPath = () => path.join(app.getPath("userData"), "settings.json");
const { mainTranslations } = require("./translations.cjs");
const {
  createDefaultSettings,
  sanitizeSettings: sanitizeSettingsValue,
  createSettingsStore,
} = require("./settings.cjs");
const { correctTextWithApi, transcribeAudioWithApi } = require("./ai-api.cjs");

function getSystemLanguage() {
  const locale = app.getLocale();
  const normalized = locale ? locale.toLowerCase() : "";
  if (normalized.startsWith("pl")) return "pl";
  if (normalized.startsWith("de")) return "de";
  if (normalized.startsWith("ru")) return "ru";
  return "en";
}

function getLang(s) {
  const langSetting = s.appLanguage || "system";
  if (langSetting === "system") {
    return getSystemLanguage();
  }
  return langSetting;
}

const defaults = createDefaultSettings(
  path.join(app.getPath("documents"), "Szeptucha"),
);
const sanitizeSettings = value => sanitizeSettingsValue(value, defaults);
const settingsStore = createSettingsStore({
  getConfigPath: configPath,
  defaults,
  safeStorage,
  fs,
});
const MAX_TEXT_LENGTH = 1_000_000;
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;
const MAX_NOTE_READ_BYTES = 10 * 1024 * 1024;
const MAX_NOTE_PREVIEW_BYTES = 16 * 1024;
const MAX_NOTE_PREVIEW_LENGTH = 4_000;
const NOTES_PAGE_SIZE = 24;
const DEFAULT_AUDIO_MIME = "audio/webm";

function normalizeAudioMime(value) {
  if (!value) return DEFAULT_AUDIO_MIME;
  if (typeof value !== "string" || value.length > 200) return null;

  // MediaRecorder commonly reports values such as
  // "audio/webm;codecs=opus". APIs only need the base media type.
  const mediaType = value.split(";", 1)[0].trim().toLowerCase();
  return /^audio\/[\w.+-]+$/.test(mediaType) ? mediaType : null;
}

function settings() {
  return settingsStore.load();
}
function save(value) {
  return settingsStore.save(value);
}
function saveTranscription(text, s) {
  if (typeof text !== "string" || text.length > MAX_TEXT_LENGTH) {
    throw new Error("Invalid transcription");
  }
  const lang = getLang(s);
  const t = mainTranslations[lang] || mainTranslations.en;
  
  const shouldSave = pasteTranscription
    ? s.saveFromShortcut
    : s.saveFromInterface;
  if (!shouldSave) {
    status("success", t.statusReadyNoSave);
    return { text, path: "" };
  }
  fs.mkdirSync(s.folder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = t.noteFilePrefix;
  const file = path.join(s.folder, `${prefix}-${stamp}.${s.format}`);
  let content = text;
  if (s.format === "md") content = `${t.noteDocHeader}\n\n${text}\n`;
  if (s.format === "json")
    content = JSON.stringify({ createdAt: new Date().toISOString(), text }, null, 2);
  fs.writeFileSync(file, content, "utf8");
  status("success", `${t.statusSaved}: ${path.basename(file)}`);
  return { text, path: file };
}
function status(type, message) {
  win?.webContents.send("status", { type, message });
}
function asset(name) {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app.asar", "assets", name)
    : path.join(__dirname, "..", "assets", name);
}
function createWindow() {
  win = new BrowserWindow({
    width: 1160,
    height: 800,
    minWidth: 800,
    minHeight: 650,
    title: "Szeptucha",
    icon: asset("icon.png"),
    backgroundColor: "#f7f5f2",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  if (process.env.VITE_DEV_SERVER_URL)
    win.loadURL(process.env.VITE_DEV_SERVER_URL);
  else if (!app.isPackaged) win.loadURL("http://localhost:5173");
  else win.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  win.on("close", (e) => {
    if (!app.isQuiting) {
      e.preventDefault();
      win.hide();
    }
  });
}
function updateRecordingIndicatorLang(s) {
  if (!recordingIndicator || recordingIndicator.isDestroyed()) return;
  const lang = getLang(s);
  const t = mainTranslations[lang] || mainTranslations.en;
  
  recordingIndicator.webContents.executeJavaScript(`
    const b = document.querySelector('.text b');
    const small = document.querySelector('.text small');
    if (b) b.textContent = ${JSON.stringify(t.recordingActive)};
    if (small) small.textContent = ${JSON.stringify(t.recordingSub)};
  `).catch(console.error);
}
function createRecordingIndicator() {
  const s = settings();
  const lang = getLang(s);
  const t = mainTranslations[lang] || mainTranslations.en;

  recordingIndicator = new BrowserWindow({
    width: 400,
    height: 104,
    frame: false,
    resizable: false,
    movable: false,
    show: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    transparent: true,
    focusable: false,
    hasShadow: false,
    backgroundColor: "#00000000",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  recordingIndicator.setAlwaysOnTop(true, "screen-saver");
  recordingIndicator.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true,
  });
  recordingIndicator.setIgnoreMouseEvents(true);
  recordingIndicator.loadURL(
    "data:text/html;charset=utf-8," +
      encodeURIComponent(`<!doctype html>
<html>
<head>
<meta charset="utf-8">
<style>
html,body{margin:0;width:100%;height:100%;background:transparent;font-family:"Segoe UI",Arial,sans-serif;overflow:hidden}
.wrap{height:100%;display:grid;place-items:center}
.pill{width:326px;height:72px;border:1px solid rgba(234,223,226,.96);border-radius:18px;background:rgba(255,255,255,.94);box-shadow:0 4px 12px rgba(33,30,41,.15);display:flex;align-items:center;gap:15px;padding:0 18px;color:#2a2630}
html[data-theme="dark"] .pill{border-color:rgba(62,56,70,.96);background:rgba(33,30,40,.96);box-shadow:0 4px 12px rgba(0,0,0,.35);color:#eeeaf3}
.dot{width:12px;height:12px;border-radius:50%;background:#d94848;box-shadow:0 0 0 7px rgba(217,72,72,.14);animation:blink 1s ease-in-out infinite}
.text{min-width:0}
b{display:block;font-size:14px;line-height:1.1}
small{display:block;color:#746d7a;font-size:11px;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
html[data-theme="dark"] small{color:#aaa3b2}
.wave{margin-left:auto;height:36px;display:flex;align-items:center;gap:4px}
.wave span{width:5px;height:13px;border-radius:99px;background:linear-gradient(180deg,#ee7777,#8954cf);animation:wave .95s ease-in-out infinite}
.wave span:nth-child(2){animation-delay:.1s}.wave span:nth-child(3){animation-delay:.2s}.wave span:nth-child(4){animation-delay:.3s}.wave span:nth-child(5){animation-delay:.4s}
@keyframes wave{0%,100%{height:11px;opacity:.72}50%{height:34px;opacity:1}}
@keyframes blink{0%,100%{opacity:1}50%{opacity:.45}}
</style>
</head>
<body>
<div class="wrap">
  <div class="pill">
    <span class="dot"></span>
    <div class="text"><b>${t.recordingActive}</b><small>${t.recordingSub}</small></div>
    <div class="wave"><span></span><span></span><span></span><span></span><span></span></div>
  </div>
</div>
</body>
</html>`),
  );
}
function showRecordingIndicator(active) {
  if (!recordingIndicator || recordingIndicator.isDestroyed()) return;
  if (!active) {
    recordingIndicator.hide();
    return;
  }
  const s = settings();
  updateRecordingIndicatorLang(s);

  const cursorPos = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPos);
  const area = display.workArea;
  recordingIndicator.setPosition(
    Math.round(area.x + area.width / 2 - 200),
    area.y + area.height - 128,
    false,
  );
  recordingIndicator.showInactive();
}
function requestRecordingToggle(source) {
  if (recordingBusy && !recording) return;
  win?.webContents.send("recording:toggle", source);
}
function shortcuts() {
  for (const hotkey of registeredHotkeys) globalShortcut.unregister(hotkey);
  registeredHotkeys = [];
  const s = settings();
  if (s.recordHotkey) {
    try {
      if (globalShortcut.register(s.recordHotkey, () => requestRecordingToggle("shortcut"))) registeredHotkeys.push(s.recordHotkey);
    } catch (e) {
      console.error("Failed to register record hotkey:", e);
    }
  }
  if (s.correctHotkey) {
    try {
      if (globalShortcut.register(s.correctHotkey, () => correctText())) registeredHotkeys.push(s.correctHotkey);
    } catch (e) {
      console.error("Failed to register correct hotkey:", e);
    }
  }
}
function trayMenu() {
  const s = settings();
  const lang = getLang(s);
  const t = mainTranslations[lang] || mainTranslations.en;

  if (!tray) {
    const icon = nativeImage
      .createFromPath(asset("icon.png"))
      .resize({ width: 20, height: 20 });
    tray = new Tray(icon);
    tray.on("double-click", () => win.show());
  }
  tray.setToolTip(recording ? `Szeptucha (${t.recordingActive || "Nagrywam..."})` : "Szeptucha");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t.trayOpen, click: () => win.show() },
      {
        label: recording ? t.trayStop : recordingBusy ? t.trayTranscribing : t.trayRecord,
        enabled: !recordingBusy || recording,
        click: () => {
          requestRecordingToggle("tray");
        },
      },
      { type: "separator" },
      { label: t.trayOcrOpen, click: () => ocr.show() },
      { label: t.trayOcrCapture, click: () => ocr.capture() },
      { type: "separator" },
      {
        label: t.trayExit,
        click: () => {
          app.isQuiting = true;
          app.quit();
        },
      },
    ]),
  );
}
async function aiCorrect(text, s) {
  return correctTextWithApi({ text, settings: s, lang: getLang(s) });
}
function keys(action) {
  return new Promise((resolve, reject) => {
    if (process.platform === "win32") {
      const seq = action === "copy" ? "^c" : "^v";
      const p = spawn(
        "powershell",
        [
          "-NoProfile",
          "-STA",
          "-Command",
          `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${seq}')`,
        ],
        { windowsHide: true },
      );
      p.on("exit", (c) =>
        c ? reject(new Error("Nie udało się wysłać skrótu")) : resolve(),
      );
    } else if (process.platform === "darwin") {
      const keyChar = action === "copy" ? "c" : "v";
      const script = `tell application "System Events" to keystroke "${keyChar}" using {command down}`;
      const p = spawn("osascript", ["-e", script]);
      p.on("exit", (c) =>
        c ? reject(new Error("Failed to send shortcut")) : resolve(),
      );
    } else {
      const keySeq = action === "copy" ? "ctrl+c" : "ctrl+v";
      const p = spawn("xdotool", ["key", keySeq]);
      p.on("exit", (c) =>
        c ? reject(new Error("Failed to send shortcut - make sure xdotool is installed")) : resolve(),
      );
    }
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function correctText() {
  const s = settings();
  const lang = getLang(s);
  const t = mainTranslations[lang] || mainTranslations.en;
  if (s.provider === "local") {
    const message =
      lang === "pl"
        ? "Lokalny silnik nie obsługuje jeszcze korekty tekstu"
        : lang === "de"
          ? "Das lokale Modul unterstützt die Textkorrektur noch nicht"
          : "The local engine does not support text correction yet";
    status("error", message);
    return { ok: false, message };
  }
  if (!s.apiKey) {
    status("error", t.statusNoApiKey);
    win?.show();
    return { ok: false, message: t.statusNoApiKey };
  }

  const prevClipboard = clipboard.readText();
  try {
    clipboard.clear();
    await keys("copy");

    let text = "";
    for (let i = 0; i < 10; i++) {
      await wait(50);
      text = clipboard.readText();
      if (text && text.trim()) break;
    }

    if (!text || !text.trim()) {
      if (prevClipboard) clipboard.writeText(prevClipboard);
      throw new Error(t.statusSelectText || (lang === "pl" ? "Zaznacz tekst przed użyciem skrótu" : "Select text before using shortcut"));
    }

    status("info", t.statusCorrecting);
    const corrected = await aiCorrect(text, s);
    clipboard.writeText(corrected.trim());
    await keys("paste");
    status("success", t.statusCorrected);
    return { ok: true, message: "Gotowe" };
  } catch (e) {
    status("error", e.message);
    return { ok: false, message: e.message };
  }
}
async function transcribe(buf, mime) {
  const isAudioBuffer =
    buf instanceof ArrayBuffer || ArrayBuffer.isView(buf);
  const audioMime = normalizeAudioMime(mime);
  if (
    !isAudioBuffer ||
    buf.byteLength === 0 ||
    buf.byteLength > MAX_AUDIO_BYTES ||
    !audioMime
  ) {
    throw new Error("Invalid audio data");
  }
  const s = settings();
  const lang = getLang(s);
  const t = mainTranslations[lang] || mainTranslations.en;
  if (!s.apiKey) throw new Error(t.statusNoApiKeySettings);
  status("info", t.statusTranscribing);

  const text = await transcribeAudioWithApi({
    buf,
    mime: audioMime,
    settings: s,
    lang,
    systemLanguage: getSystemLanguage(),
  });
  return saveTranscription(text, s);
}

function noteText(raw, format) {
  if (format === "json") {
    try {
      const parsed = JSON.parse(raw);
      return typeof parsed?.text === "string" ? parsed.text : raw;
    } catch {
      // A preview can end in the middle of a JSON document. Recover the text
      // field prefix so long JSON notes still have useful cards in the list.
      const encoded = /"text"\s*:\s*"((?:\\.|[^"\\])*)/.exec(raw)?.[1];
      if (encoded === undefined) return raw;
      try { return JSON.parse(`"${encoded}"`); } catch { return raw; }
    }
  }
  return format === "md" ? raw.replace(/^#\s*Notatka[^\n]*\n+/i, "") : raw;
}

async function readNotePrefix(filePath, format, fileSize, signal) {
  if (fileSize === 0) return { text: "", truncated: false };
  const stream = fs.createReadStream(filePath, {
    encoding: "utf8",
    start: 0,
    end: Math.min(fileSize, MAX_NOTE_PREVIEW_BYTES) - 1,
    signal,
  });
  let raw = "";
  for await (const chunk of stream) raw += chunk;
  const text = noteText(raw, format).trim();
  return {
    text: text.slice(0, MAX_NOTE_PREVIEW_LENGTH),
    truncated: fileSize > MAX_NOTE_PREVIEW_BYTES || text.length > MAX_NOTE_PREVIEW_LENGTH,
  };
}

async function noteContains(filePath, fileSize, query, signal) {
  if (!query) return true;
  if (fileSize === 0) return false;
  const stream = fs.createReadStream(filePath, {
    encoding: "utf8",
    start: 0,
    end: Math.min(fileSize, MAX_NOTE_READ_BYTES) - 1,
    signal,
  });
  let carry = "";
  const overlap = query.length - 1;
  for await (const chunk of stream) {
    const current = carry + chunk.toLowerCase();
    if (current.includes(query)) return true;
    carry = overlap > 0 ? current.slice(-overlap) : "";
  }
  return false;
}

async function getNotesFromFolder(folderPath, options = {}, signal) {
  const request = options && typeof options === "object" ? options : {};
  const requestedPage = Number.isSafeInteger(request.page) ? Math.max(0, request.page) : 0;
  const pageSize = NOTES_PAGE_SIZE;
  const query = typeof request.search === "string"
    ? request.search.trim().slice(0, 200).toLowerCase()
    : "";
  if (!folderPath) return { items: [], total: 0, page: 0, pageSize };

  try {
    const entries = await fs.promises.readdir(folderPath, { withFileTypes: true });
    if (signal?.aborted) return { items: [], total: 0, page: 0, pageSize };
    const notes = [];
    for (const entry of entries) {
      if (signal?.aborted) return { items: [], total: 0, page: 0, pageSize };
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase().slice(1);
      if (!["md", "txt", "json"].includes(ext)) continue;
      const filePath = path.join(folderPath, entry.name);
      try {
        const stat = await fs.promises.stat(filePath);
        notes.push({
          id: entry.name,
          filename: entry.name,
          createdAt: stat.mtime.toISOString(),
          format: ext,
          sizeBytes: stat.size,
          filePath,
        });
      } catch {
        // A note may be removed while the history is being refreshed.
      }
    }
    notes.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    let matching = notes;
    if (query) {
      matching = [];
      for (const note of notes) {
        if (signal?.aborted) return { items: [], total: 0, page: 0, pageSize };
        if (note.filename.toLowerCase().includes(query)) {
          matching.push(note);
          continue;
        }
        try {
          if (await noteContains(note.filePath, note.sizeBytes, query, signal)) matching.push(note);
        } catch {
          if (signal?.aborted) return { items: [], total: 0, page: 0, pageSize };
          // Ignore unreadable files and keep the rest of the history searchable.
        }
      }
    }

    const total = matching.length;
    const page = Math.min(requestedPage, Math.max(0, Math.ceil(total / pageSize) - 1));
    const pageNotes = matching.slice(page * pageSize, (page + 1) * pageSize);
    const items = await Promise.all(pageNotes.map(async note => {
      let preview = { text: "", truncated: note.sizeBytes > MAX_NOTE_PREVIEW_BYTES };
      try { preview = await readNotePrefix(note.filePath, note.format, note.sizeBytes, signal); } catch {}
      const { filePath, ...publicNote } = note;
      return { ...publicNote, ...preview };
    }));
    if (signal?.aborted) return { items: [], total: 0, page: 0, pageSize };
    return { items, total, page, pageSize };
  } catch (e) {
    console.error("Error reading notes:", e);
    return { items: [], total: 0, page: 0, pageSize };
  }
}

async function noteFilePath(fileName) {
  if (typeof fileName !== "string" || !fileName || path.basename(fileName) !== fileName) {
    throw new Error("Invalid note name");
  }
  const ext = path.extname(fileName).toLowerCase();
  if (![".md", ".txt", ".json"].includes(ext)) throw new Error("Invalid note type");
  const folderPath = settings().folder;
  if (!folderPath) throw new Error("Notes folder is unavailable");
  const filePath = path.join(folderPath, fileName);
  const stat = await fs.promises.lstat(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error("Invalid note file");
  return { filePath, stat, format: ext.slice(1) };
}

async function readNote(fileName) {
  const { filePath, stat, format } = await noteFilePath(fileName);
  if (stat.size > MAX_NOTE_READ_BYTES) throw new Error("Note is too large to open");
  return noteText(await fs.promises.readFile(filePath, "utf8"), format);
}

async function deleteNote(fileName) {
  try {
    const { filePath } = await noteFilePath(fileName);
    await fs.promises.unlink(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

app.whenReady().then(async () => {
  createWindow();
  createRecordingIndicator();
  await ocr.init();
  trayMenu();
  shortcuts();
});
app.on("window-all-closed", () => {});
app.on("before-quit", () => { app.isQuiting = true; });
app.on("will-quit", () => globalShortcut.unregisterAll());
ipcMain.on("ocr:show", (event) => { if (event.sender === win?.webContents) ocr.show(); });
ipcMain.on("theme:set", (_, theme) => {
  if (!recordingIndicator || recordingIndicator.isDestroyed()) return;
  const safeTheme = theme === "dark" ? "dark" : "light";
  recordingIndicator.webContents.executeJavaScript(
    `document.documentElement.dataset.theme = ${JSON.stringify(safeTheme)}`,
  );
});
ipcMain.handle("settings:get", () => settings());
ipcMain.handle("settings:save", (_, s) => {
  const saved = save(s);
  app.setLoginItemSettings({ openAtLogin: saved.launchAtStartup });
  shortcuts();
  trayMenu();
  updateRecordingIndicatorLang(saved);
  return saved;
});
ipcMain.handle("folder:choose", async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("folder:open", () => {
  const f = settings().folder;
  if (f) {
    fs.mkdirSync(f, { recursive: true });
    return shell.openPath(f);
  }
});
ipcMain.handle("audio:transcribe", (_, b, m) => transcribe(b, m));
ipcMain.handle("transcription:save", (_, text) => {
  const s = settings();
  return saveTranscription(text, s);
});
ipcMain.handle("text:correct", () => correctText());
ipcMain.handle("notes:get", async (_, options) => {
  activeNotesRequest?.abort();
  const request = new AbortController();
  activeNotesRequest = request;
  try {
    const s = settings();
    return await getNotesFromFolder(s.folder, options, request.signal);
  } finally {
    if (activeNotesRequest === request) activeNotesRequest = null;
  }
});
ipcMain.handle("notes:read", (_, fileName) => readNote(fileName));
ipcMain.handle("notes:delete", (_, fileName) => deleteNote(fileName));
ipcMain.on("recording:state", (_, state) => {
  const nextState = state && typeof state === "object" ? state : {};
  const wasRecording = recording;
  const wasBusy = recordingBusy;
  const phase = nextState.phase;
  recording = phase === "recording";
  recordingBusy = ["starting", "recording", "transcribing", "loading-model"].includes(phase);
  if (phase === "starting") pasteTranscription = nextState.source === "shortcut";
  if (phase === "completed" || phase === "error") pasteTranscription = false;
  if (wasRecording !== recording) showRecordingIndicator(recording);
  if (wasRecording !== recording || wasBusy !== recordingBusy) trayMenu();
});
ipcMain.on("transcription:status", (_, message) => status("info", message));
ipcMain.handle("transcription:paste", async (_, text) => {
  if (!pasteTranscription) return false;
  pasteTranscription = false;
  clipboard.writeText(String(text || "").trim());
  await wait(150);
  await keys("paste");
  
  const s = settings();
  const lang = getLang(s);
  const t = mainTranslations[lang] || mainTranslations.en;
  status("success", t.statusPasted);
  return true;
});
ipcMain.on("recording:error", (_, m) => {
  recording = false;
  recordingBusy = false;
  pasteTranscription = false;
  showRecordingIndicator(false);
  trayMenu();
  status("error", m);
});
