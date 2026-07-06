const {
  app,
  BrowserWindow,
  ipcMain,
  dialog,
  globalShortcut,
  Tray,
  Menu,
  nativeImage,
  shell,
  clipboard,
} = require("electron");
const path = require("path"),
  fs = require("fs"),
  { spawn } = require("child_process");
let win,
  tray,
  recording = false,
  pasteTranscription = false;
const configPath = () => path.join(app.getPath("userData"), "settings.json");
const defaults = {
  provider: "openai",
  apiKey: "",
  model: "gpt-4o-mini-transcribe",
  folder: path.join(app.getPath("documents"), "Szeptucha"),
  format: "md",
  recordHotkey: "CommandOrControl+Shift+R",
  correctHotkey: "CommandOrControl+Q",
  launchAtStartup: false,
  language: "pl",
};
function settings() {
  try {
    return {
      ...defaults,
      ...JSON.parse(fs.readFileSync(configPath(), "utf8")),
    };
  } catch {
    return defaults;
  }
}
function save(s) {
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify(s, null, 2));
  return s;
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
function shortcuts() {
  globalShortcut.unregisterAll();
  const s = settings();
  try {
    globalShortcut.register(s.recordHotkey, () => {
      if (!recording) pasteTranscription = true;
      recording = !recording;
      win?.webContents.send("recording:toggle", recording);
    });
  } catch {}
  try {
    globalShortcut.register(s.correctHotkey, () => correctText());
  } catch {}
}
function trayMenu() {
  const icon = nativeImage
    .createFromPath(asset("icon.png"))
    .resize({ width: 20, height: 20 });
  tray = new Tray(icon);
  tray.setToolTip("Szeptucha");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Otwórz Szeptuchę", click: () => win.show() },
      {
        label: "Nagraj notatkę",
        click: () => {
          recording = !recording;
          win.webContents.send("recording:toggle", recording);
          win.show();
        },
      },
      { type: "separator" },
      {
        label: "Zakończ",
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
  const prompt =
    "Popraw wyłącznie literówki, błędy ortograficzne, interpunkcyjne i oczywiste błędy gramatyczne. Nie zmieniaj treści, znaczenia, tonu ani stylu. Zwróć tylko poprawiony tekst, bez komentarza.\n\n" +
    text;
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
      throw new Error((await r.json()).error?.message || "Błąd OpenAI");
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
  if (!r.ok) throw new Error((await r.json()).error?.message || "Błąd Gemini");
  return (await r.json()).candidates[0].content.parts[0].text;
}
function keys(seq) {
  return new Promise((resolve, reject) => {
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
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function correctText() {
  const s = settings();
  if (!s.apiKey) {
    status("error", "Najpierw podaj klucz API");
    win.show();
    return { ok: false, message: "Brak klucza API" };
  }
  try {
    await keys("^c");
    await wait(250);
    const text = clipboard.readText();
    if (!text.trim()) throw new Error("Zaznacz tekst do poprawienia");
    status("info", "Poprawiam zaznaczony tekst…");
    const corrected = await aiCorrect(text, s);
    clipboard.writeText(corrected.trim());
    await keys("^v");
    status("success", "Tekst został poprawiony");
    return { ok: true, message: "Gotowe" };
  } catch (e) {
    status("error", e.message);
    return { ok: false, message: e.message };
  }
}
async function transcribe(buf, mime) {
  const s = settings();
  if (!s.apiKey) throw new Error("Najpierw podaj klucz API w ustawieniach");
  status("info", "Transkrybuję nagranie…");
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
    form.append("language", s.language);
    const r = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${s.apiKey}` },
      body: form,
    });
    if (!r.ok)
      throw new Error(
        (await r.json()).error?.message || "Błąd transkrypcji OpenAI",
      );
    text = (await r.json()).text;
  } else {
    const model = s.model.startsWith("gemini") ? s.model : "gemini-2.0-flash";
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
                  text: "Dokładnie przepisz tę polską notatkę głosową. Zwróć tylko transkrypcję.",
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
        (await r.json()).error?.message || "Błąd transkrypcji Gemini",
      );
    text = (await r.json()).candidates[0].content.parts[0].text;
  }
  fs.mkdirSync(s.folder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-"),
    file = path.join(s.folder, `notatka-${stamp}.${s.format}`);
  let content = text;
  if (s.format === "md") content = `# Notatka głosowa\n\n${text}\n`;
  if (s.format === "json")
    content = JSON.stringify(
      { createdAt: new Date().toISOString(), text },
      null,
      2,
    );
  fs.writeFileSync(file, content, "utf8");
  status("success", `Zapisano: ${path.basename(file)}`);
  return { text, path: file };
}
app.whenReady().then(() => {
  createWindow();
  trayMenu();
  shortcuts();
});
app.on("window-all-closed", () => {});
app.on("will-quit", () => globalShortcut.unregisterAll());
ipcMain.handle("settings:get", () => settings());
ipcMain.handle("settings:save", (_, s) => {
  save(s);
  app.setLoginItemSettings({ openAtLogin: s.launchAtStartup });
  shortcuts();
  return s;
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
  fs.mkdirSync(s.folder, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const file = path.join(s.folder, `notatka-${stamp}.${s.format}`);
  let content = text;
  if (s.format === "md") content = `# Notatka głosowa\n\n${text}\n`;
  if (s.format === "json")
    content = JSON.stringify({ createdAt: new Date().toISOString(), text }, null, 2);
  fs.writeFileSync(file, content, "utf8");
  status("success", `Zapisano: ${path.basename(file)}`);
  return { text, path: file };
});
ipcMain.handle("text:correct", () => correctText());
ipcMain.on("recording:state", (_, v) => (recording = v));
ipcMain.on("transcription:status", (_, message) => status("info", message));
ipcMain.handle("transcription:paste", async (_, text) => {
  if (!pasteTranscription) return false;
  pasteTranscription = false;
  clipboard.writeText(String(text || "").trim());
  await wait(150);
  await keys("^v");
  status("success", "Transkrypcja została wklejona");
  return true;
});
ipcMain.on("recording:error", (_, m) => {
  recording = false;
  pasteTranscription = false;
  status("error", m);
});
