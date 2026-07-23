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
let win,
  recordingIndicator,
  tray,
  recording = false,
  pasteTranscription = false;
const configPath = () => path.join(app.getPath("userData"), "settings.json");
const { mainTranslations } = require("./translations.cjs");

function getSystemLanguage() {
  const locale = app.getLocale();
  return locale && locale.toLowerCase().startsWith("pl") ? "pl" : "en";
}

function getLang(s) {
  const langSetting = s.appLanguage || "system";
  if (langSetting === "system") {
    return getSystemLanguage();
  }
  return langSetting;
}

const defaults = {
  provider: "openai",
  apiKey: "",
  model: "gpt-4o-mini-transcribe",
  folder: path.join(app.getPath("documents"), "Szeptucha"),
  format: "md",
  recordHotkey: "CommandOrControl+Shift+R",
  correctHotkey: "CommandOrControl+Q",
  launchAtStartup: false,
  language: "auto",
  saveFromInterface: true,
  saveFromShortcut: true,
  appLanguage: "system",
};
const providers = new Set(["openai", "gemini", "local"]);
const formats = new Set(["md", "txt", "json"]);
const appLanguages = new Set(["system", "pl", "en"]);
const recordingLanguages = new Set(["auto", "pl", "en"]);
const providerModels = {
  openai: new Set(["gpt-4o-mini-transcribe"]),
  gemini: new Set(["gemini-2.0-flash"]),
  local: new Set(["whisper-tiny"]),
};
const MAX_TEXT_LENGTH = 1_000_000;
const MAX_AUDIO_BYTES = 100 * 1024 * 1024;

function limitedString(value, fallback, maxLength = 500) {
  return typeof value === "string" && value.length <= maxLength
    ? value
    : fallback;
}
function sanitizeSettings(value = {}) {
  const source = value && typeof value === "object" ? value : {};
  const provider = providers.has(source.provider)
    ? source.provider
    : defaults.provider;
  const requestedModel = limitedString(source.model, "", 200);
  const model = providerModels[provider].has(requestedModel)
    ? requestedModel
    : provider === "openai"
      ? "gpt-4o-mini-transcribe"
      : provider === "gemini"
        ? "gemini-2.0-flash"
        : "whisper-tiny";
  const requestedFolder = limitedString(source.folder, defaults.folder, 32_000);
  return {
    ...defaults,
    provider,
    apiKey: limitedString(source.apiKey, "", 10_000).trim(),
    model,
    folder: path.isAbsolute(requestedFolder) ? requestedFolder : defaults.folder,
    format: formats.has(source.format) ? source.format : defaults.format,
    recordHotkey: limitedString(source.recordHotkey, defaults.recordHotkey, 200),
    correctHotkey: limitedString(source.correctHotkey, defaults.correctHotkey, 200),
    launchAtStartup: Boolean(source.launchAtStartup),
    language: recordingLanguages.has(source.language)
      ? source.language
      : defaults.language,
    saveFromInterface:
      typeof source.saveFromInterface === "boolean"
        ? source.saveFromInterface
        : defaults.saveFromInterface,
    saveFromShortcut:
      typeof source.saveFromShortcut === "boolean"
        ? source.saveFromShortcut
        : defaults.saveFromShortcut,
    appLanguage: appLanguages.has(source.appLanguage)
      ? source.appLanguage
      : defaults.appLanguage,
  };
}
function decryptApiKey(value) {
  if (!value || !safeStorage.isEncryptionAvailable()) return "";
  try {
    return safeStorage.decryptString(Buffer.from(value, "base64"));
  } catch {
    return "";
  }
}
function settings() {
  try {
    const stored = JSON.parse(fs.readFileSync(configPath(), "utf8"));
    const apiKey = stored.apiKeyEncrypted
      ? decryptApiKey(stored.apiKeyEncrypted)
      : limitedString(stored.apiKey, "", 10_000);
    const result = sanitizeSettings({ ...stored, apiKey });
    if (stored.apiKey && safeStorage.isEncryptionAvailable()) save(result);
    return result;
  } catch {
    return { ...defaults };
  }
}
function save(s) {
  const sanitized = sanitizeSettings(s);
  const stored = { ...sanitized };
  if (stored.apiKey && safeStorage.isEncryptionAvailable()) {
    stored.apiKeyEncrypted = safeStorage
      .encryptString(stored.apiKey)
      .toString("base64");
    delete stored.apiKey;
  }
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  const temporaryPath = `${configPath()}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(stored, null, 2), "utf8");
  fs.renameSync(temporaryPath, configPath());
  return sanitized;
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
function setRecordingState(active) {
  recording = active;
  showRecordingIndicator(active);
  win?.webContents.send("recording:toggle", active);
}
function shortcuts() {
  globalShortcut.unregisterAll();
  const s = settings();
  try {
    globalShortcut.register(s.recordHotkey, () => {
      if (!recording) pasteTranscription = true;
      setRecordingState(!recording);
    });
  } catch {}
  try {
    globalShortcut.register(s.correctHotkey, () => correctText());
  } catch {}
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
  }
  tray.setToolTip("Szeptucha");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: t.trayOpen, click: () => win.show() },
      {
        label: t.trayRecord,
        click: () => {
          setRecordingState(!recording);
        },
      },
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
  tray.on("double-click", () => win.show());
}
async function aiCorrect(text, s) {
  const lang = getLang(s);
  const prompt = lang === "pl"
    ? "Popraw wyłącznie literówki, błędy ortograficzne, interpunkcyjne i oczywiste błędy gramatyczne. Nie zmieniaj treści, znaczenia, tonu ani stylu. Zwróć tylko poprawiony tekst, bez komentarza.\n\n" + text
    : "Correct only typos, spelling, punctuation, and obvious grammatical errors. Do not change the content, meaning, tone, or style. Return only the corrected text, without any comments.\n\n" + text;

  if (s.provider === "local") {
    throw new Error(
      lang === "pl"
        ? "Lokalny silnik nie obsługuje jeszcze korekty tekstu"
        : "The local engine does not support text correction yet",
    );
  }
  if (s.provider === "openai") {
    const r = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${s.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0,
      }),
    });
    if (!r.ok)
      throw new Error((await r.json()).error?.message || (lang === "pl" ? "Błąd OpenAI" : "OpenAI error"));
    return (await r.json()).choices[0].message.content;
  }
  const model = s.model.startsWith("gemini") ? s.model : "gemini-2.0-flash";
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${s.apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0 },
      }),
    },
  );
  if (!r.ok) throw new Error((await r.json()).error?.message || (lang === "pl" ? "Błąd Gemini" : "Gemini error"));
  return (await r.json()).candidates[0].content.parts[0].text;
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
        : "The local engine does not support text correction yet";
    status("error", message);
    return { ok: false, message };
  }
  if (!s.apiKey) {
    status("error", t.statusNoApiKey);
    win.show();
    return { ok: false, message: t.statusNoApiKey };
  }
  try {
    await keys("copy");
    await wait(250);
    const text = clipboard.readText();
    if (!text.trim()) throw new Error(t.statusSelectText);
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
  if (
    !isAudioBuffer ||
    buf.byteLength === 0 ||
    buf.byteLength > MAX_AUDIO_BYTES ||
    (mime && (typeof mime !== "string" || !/^audio\/[\w.+-]+$/.test(mime)))
  ) {
    throw new Error("Invalid audio data");
  }
  const s = settings();
  const lang = getLang(s);
  const t = mainTranslations[lang] || mainTranslations.en;
  if (!s.apiKey) throw new Error(t.statusNoApiKeySettings);
  status("info", t.statusTranscribing);
  let text;
  if (s.provider === "openai") {
    const form = new FormData();
    form.append(
      "file",
      new Blob([buf], { type: mime || "audio/webm" }),
      "nagranie.webm",
    );
    form.append(
      "model",
      s.model.startsWith("gpt-") ? s.model : "gpt-4o-mini-transcribe",
    );
    if (s.language && s.language !== "auto") {
      form.append("language", s.language);
    }
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${s.apiKey}` },
      body: form,
    });
    if (!r.ok)
      throw new Error(
        (await r.json()).error?.message || (lang === "pl" ? "Błąd transkrypcji OpenAI" : "OpenAI transcription error"),
      );
    text = (await r.json()).text;
  } else {
    const model = s.model.startsWith("gemini") ? s.model : "gemini-2.0-flash";
    
    // Resolve recording language
    const recordingLang = s.language && s.language !== "auto" ? s.language : getSystemLanguage();
    
    let geminiInstruction;
    if (recordingLang === "pl") {
      geminiInstruction = "Dokładnie przepisz tę polską notatkę głosową. Zwróć tylko transkrypcję.";
    } else {
      geminiInstruction = "Accurately transcribe this English voice note. Return only the transcription.";
    }

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${s.apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: geminiInstruction,
                },
                {
                  inline_data: {
                    mime_type: mime || "audio/webm",
                    data: Buffer.from(buf).toString("base64"),
                  },
                },
              ],
            },
          ],
        }),
      },
    );
    if (!r.ok)
      throw new Error(
        (await r.json()).error?.message || (lang === "pl" ? "Błąd transkrypcji Gemini" : "Gemini transcription error"),
      );
    text = (await r.json()).candidates[0].content.parts[0].text;
  }
  return saveTranscription(text, s);
}
app.whenReady().then(() => {
  createWindow();
  createRecordingIndicator();
  trayMenu();
  shortcuts();
});
app.on("window-all-closed", () => {});
app.on("will-quit", () => globalShortcut.unregisterAll());
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
ipcMain.on("recording:state", (_, v) => {
  recording = v;
  showRecordingIndicator(v);
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
  pasteTranscription = false;
  showRecordingIndicator(false);
  status("error", m);
});
