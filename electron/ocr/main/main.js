const { app, BrowserWindow, ipcMain, globalShortcut, screen, desktopCapturer, clipboard, nativeImage, Notification, shell, systemPreferences } = require('electron');
const path = require('node:path');
const { cropRectangle } = require('../shared/geometry');
const { makeWorker } = require('./ocr');
const { captureDisplays, withTimeout } = require('./capture');
const { createHistoryStore } = require('./history');
const { normalizeOcrText } = require('../shared/text');
const { readAppState, writeAppState } = require('./storage');
const APP_ICON = path.join(__dirname, '..', '..', '..', 'assets', process.platform === 'win32' ? 'icon.ico' : 'icon.png');
const CAPTURE_SHORTCUT = process.platform === 'darwin' ? 'Alt+Shift+Q' : 'Super+Shift+Q';
const CAPTURE_SHORTCUT_LABEL = process.platform === 'darwin' ? '⌥ + Shift + Q' : process.platform === 'win32' ? 'Win + Shift + Q' : 'Super + Shift + Q';
const PASTE_SHORTCUT_LABEL = process.platform === 'darwin' ? '⌘ + V' : 'Ctrl + V';
const SCREEN_CAPTURE_SETTINGS_URL = 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture';
let main, worker, busy = false, quitting = false, initialized = false;
let captureId = 0, phase = 'idle', restoreMain = false;
let overlays = [];
let ocrRun = null;
let pendingOcrCleanup = Promise.resolve();
const history = createHistoryStore();
const defaultSettings = { autoCopy: true, keepHistory: true, persistHistory: false, normalizeText: true };
let settings = { ...defaultSettings };
let statePath = null;
let status = { message: 'Gotowy do zaznaczania', busy: false, phase: 'idle', text: '', shortcut: true, copyNotice: '' };
const send = (message, extra = {}) => {
  status = { ...status, message, busy, phase, copyNotice: '', ...extra };
  if (main && !main.isDestroyed()) main.webContents.send('status', status);
};
function showMain() {
  if (!main || main.isDestroyed()) return;
  if (main.isMinimized()) main.restore();
  if (!main.isVisible()) main.show();
  main.focus();
}
const notify = body => {
  // Portable Electron builds do not have a Start Menu shortcut with the
  // AUMID/ToastActivatorCLS​ID pair required for clickable Windows toasts.
  // Keep the app quiet in the background instead of launching electron.exe.
  if (process.platform === 'win32' && (!app.isPackaged || process.env.PORTABLE_EXECUTABLE_FILE)) {
    return;
  }
  if (!Notification.isSupported()) return;
  const notification = new Notification({ title: 'Tekst z ekranu', body });
  notification.on('click', showMain);
  notification.show();
};
async function ensureScreenCaptureAccess() {
  if (process.platform !== 'darwin' || typeof systemPreferences?.getMediaAccessStatus !== 'function') return;
  const access = systemPreferences.getMediaAccessStatus('screen');
  if (access === 'granted') return;
  try { await shell.openExternal(SCREEN_CAPTURE_SETTINGS_URL); } catch {}
  const error = new Error(access === 'restricted'
    ? 'macOS ogranicza dostęp do nagrywania ekranu. Włącz go w Ustawieniach systemowych.'
    : 'Włącz „Nagrywanie ekranu” dla aplikacji w Ustawieniach systemowych, a następnie spróbuj ponownie.');
  error.code = 'SCREEN_CAPTURE_PERMISSION';
  throw error;
}
function persistState() {
  if (!statePath) return;
  try {
    writeAppState(statePath, {
      settings,
      history: settings.keepHistory && settings.persistHistory ? history.list() : []
    });
  } catch {
    // OCR must remain usable even when the user-data directory is unavailable.
  }
}
function closeOverlays() {
  const closing = overlays;
  overlays = [];
  for (const item of closing) if (!item.window.isDestroyed()) item.window.destroy();
}
function stopOcrRun(run) {
  if (!run?.worker) return Promise.resolve();
  if (worker === run.worker) worker = null;
  return run.worker.terminate().catch(() => {});
}
function restoreWindow() {
  if (restoreMain && !quitting && main && !main.isDestroyed()) showMain();
  restoreMain = false;
}
function cancel() {
  const run = phase === 'ocr' ? ocrRun : null;
  if (run) {
    ocrRun = null;
    run.stopPromise = stopOcrRun(run);
  }
  captureId++;
  closeOverlays(); busy = false; phase = 'idle'; restoreWindow();
  send('Anulowano. Gotowy do zaznaczania.');
}
async function capture() {
  if (busy) { cancel(); return; }
  const currentId = ++captureId;
  busy = true;
  phase = 'capture';
  send('Przygotowuję zaznaczanie ekranu…');
  try {
    // A cancelled OCR run may still be unwinding after its worker was asked
    // to terminate. Do not start a new capture while that cleanup is pending,
    // otherwise two Tesseract workers can briefly coexist and spike memory.
    await pendingOcrCleanup;
    if (currentId !== captureId || quitting) return;
    await ensureScreenCaptureAccess();
    restoreMain = main.isVisible();
    if (restoreMain) { main.hide(); await new Promise(resolve => setTimeout(resolve, 180)); }
    const displays = screen.getAllDisplays();
    const captures = await captureDisplays(displays, { desktopCapturer, screen, nativeImage });
    if (currentId !== captureId) return;
    for (const { display, image } of captures) {
      const window = new BrowserWindow({ ...display.bounds, frame: false, thickFrame: false, transparent: false, resizable: false, icon: APP_ICON,
        movable: false, skipTaskbar: true, alwaysOnTop: true, show: false, enableLargerThanScreen: true,
        webPreferences: { preload: path.join(__dirname, '..', 'renderer', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
      window.setAlwaysOnTop(true, 'screen-saver');
      window.setBounds(display.bounds);
      if (process.platform === 'darwin') {
        window.setFullScreenable(false);
        window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      } else if (process.platform === 'win32') {
        window.setFullScreen(true);
      }
      const item = { window, display, image };
      overlays.push(item);
      window.webContents.on('render-process-gone', () => { if (overlays.includes(item)) cancel(); });
      window.on('closed', () => { if (overlays.includes(item)) cancel(); });
      await withTimeout(window.loadFile(path.join(__dirname, '..', 'renderer', 'overlay.html')), 10000, 'Nie udało się otworzyć zaznaczania.');
      if (currentId !== captureId) return;
      const ready = new Promise((resolve, reject) => {
        const listener = (event, success) => {
          if (event.sender !== window.webContents) return;
          ipcMain.removeListener('image-ready', listener);
          if (success) resolve(); else reject(new Error('Nie udało się wyświetlić obrazu ekranu.'));
        };
        ipcMain.on('image-ready', listener);
        window.once('closed', () => { ipcMain.removeListener('image-ready', listener); resolve(); });
      });
      window.webContents.send('capture-image', image.toDataURL());
      await withTimeout(ready, 10000, 'Nie udało się wyświetlić obrazu ekranu.');
      if (currentId !== captureId) return;
    }
    phase = 'selection';
    send(`Zaznacz fragment ekranu. Esc lub ponownie ${CAPTURE_SHORTCUT_LABEL} — anuluj.`);
    for (const item of overlays) item.window.show();
    const active = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    overlays.find(i => i.display.id === active.id)?.window.focus();
  } catch (error) {
    if (currentId !== captureId) return;
    closeOverlays(); busy = false; phase = 'idle'; restoreWindow();
    send(`Błąd: ${error.message}`, { text: '' });
    if (error.code === 'SCREEN_CAPTURE_PERMISSION') notify('Nadaj aplikacji dostęp do nagrywania ekranu w Ustawieniach systemowych.');
    else notify(status.message);
  }
}
async function recognize(event, rect) {
  const item = overlays.find(i => i.window.webContents === event.sender);
  if (!item) return;
  const currentId = captureId;
  let png;
  let run = null;
  let resolveRun = () => {};
  try {
    const region = cropRectangle(rect, item.display.bounds, item.image.getSize());
    let cropped = item.image.crop(region);
    if (region.width < 1600) cropped = cropped.resize({ width: Math.min(region.width * 2, 2400), quality: 'best' });
    png = cropped.toPNG();
    phase = 'ocr';
    closeOverlays();
    send('Odczytuję tekst lokalnie…');
    const runFinished = new Promise(resolve => { resolveRun = resolve; });
    run = { id: currentId, worker: null, stopPromise: Promise.resolve() };
    ocrRun = run;
    pendingOcrCleanup = runFinished;
    if (!worker) {
      const initializing = makeWorker(app.getPath('userData'), progress => {
        if (phase === 'ocr' && progress.status === 'recognizing text') send(`Odczytuję tekst… ${Math.round(progress.progress * 100)}%`);
      });
      let initializedWorker;
      try { initializedWorker = await withTimeout(initializing, 60000, 'Uruchomienie OCR trwa zbyt długo. Spróbuj ponownie.'); }
      catch (error) { initializing.then(lateWorker => lateWorker.terminate()).catch(() => {}); throw error; }
      if (currentId !== captureId || quitting) {
        await initializedWorker.terminate().catch(() => {});
        return;
      }
      worker = initializedWorker;
    }
    run.worker = worker;
    const activeWorker = run.worker;
    const { data } = await withTimeout(activeWorker.recognize(png), 90000, 'Odczyt trwa zbyt długo. Zaznacz mniejszy fragment.');
    if (currentId !== captureId || quitting) return;
    const text = settings.normalizeText ? normalizeOcrText(data.text) : data.text.trim();
    if (text && settings.autoCopy) await clipboard.writeText(text);
    if (currentId !== captureId || quitting) return;
    if (text && settings.keepHistory) {
      history.add({ id: `${Date.now()}-${captureId}`, text, createdAt: new Date().toISOString() });
      persistState();
    }
    busy = false; phase = 'idle';
    if (text) {
      send(settings.autoCopy ? 'Tekst skopiowany do schowka' : 'Odczyt gotowy do skopiowania', { text, copyNotice: settings.autoCopy ? 'Tekst skopiowany do schowka.' : 'Odczyt zakończony.' });
      if (settings.autoCopy) notify(`Tekst skopiowany. Wklej go za pomocą ${PASTE_SHORTCUT_LABEL}.`);
    }
    else {
      send('Nie znaleziono tekstu. Zaznacz wyraźniejszy fragment.', { text: '' });
      notify(status.message);
    }
    restoreWindow();
  } catch (error) {
    if (currentId !== captureId || quitting) return;
    closeOverlays(); busy = false; phase = 'idle'; restoreWindow();
    if (worker) { await worker.terminate().catch(() => {}); worker = null; }
    send(`Błąd OCR: ${error.message}`, { text: '' }); notify(status.message);
  } finally {
    // If cancel() already requested termination, wait for it before allowing
    // the next capture to proceed.
    if (run) {
      await run.stopPromise;
      if (ocrRun?.id === currentId) ocrRun = null;
      resolveRun();
    }
  }
}
async function init() {
  if (initialized) return;
  initialized = true;
  statePath = path.join(app.getPath('userData'), 'ocr-state.json');
  const savedState = readAppState(statePath);
  if (savedState.settings && typeof savedState.settings === 'object') {
    settings = { ...defaultSettings, ...Object.fromEntries(Object.keys(defaultSettings)
      .filter(key => typeof savedState.settings[key] === 'boolean')
      .map(key => [key, savedState.settings[key]])) };
  }
  if (settings.keepHistory && settings.persistHistory) history.load(savedState.history);

  const appIcon = nativeImage.createFromPath(APP_ICON);
  if (appIcon.isEmpty()) throw new Error(`Nie udało się wczytać ikony aplikacji: ${APP_ICON}`);
  main = new BrowserWindow({ width: 1120, height: 780, minWidth: 760, minHeight: 620, backgroundColor: '#080d18', icon: APP_ICON, autoHideMenuBar: true, show: false,
    webPreferences: { preload: path.join(__dirname, '..', 'renderer', 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  // Explicitly set the window icon on platforms that expose window chrome
  // icons. macOS uses the app bundle icon for the window and Dock instead.
  if (process.platform !== 'darwin') main.setIcon(appIcon);
  main.on('close', event => { if (!quitting) { event.preventDefault(); main.hide(); } });
  ipcMain.handle('get-status', () => status);
  ipcMain.handle('get-history', () => history.list());
  ipcMain.handle('get-settings', () => ({ ...settings }));
  ipcMain.on('set-settings', (event, next) => {
    if (event.sender !== main.webContents || !next || typeof next !== 'object') return;
    settings = { ...settings, ...Object.fromEntries(Object.keys(settings).filter(key => typeof next[key] === 'boolean').map(key => [key, next[key]])) };
    if (!settings.keepHistory) history.clear();
    persistState();
  });
  ipcMain.on('capture', event => { if (event.sender === main.webContents) capture(); });
  ipcMain.on('selection', recognize);
  ipcMain.on('cancel', event => {
    if (busy && (event.sender === main.webContents || overlays.some(i => i.window.webContents === event.sender))) cancel();
  });
  ipcMain.on('copy', async event => {
    if (event.sender !== main.webContents || !status.text) return;
    try { await clipboard.writeText(status.text); send('Tekst skopiowany do schowka', { copyNotice: 'Skopiowano do schowka.' }); }
    catch { send('Schowek jest chwilowo niedostępny. Spróbuj ponownie.'); }
  });
  ipcMain.on('clear', event => {
    if (event.sender !== main.webContents || busy) return;
    send('Gotowy do zaznaczania', { text: '' });
  });
  ipcMain.on('copy-history', async (event, id) => {
    if (event.sender !== main.webContents) return;
    const entry = history.get(id);
    if (!entry) return;
    try { await clipboard.writeText(entry.text); send('Skopiowano wpis z historii', { copyNotice: 'Skopiowano wpis z historii.' }); }
    catch { send('Schowek jest chwilowo niedostępny. Spróbuj ponownie.'); }
  });
  ipcMain.on('restore-history', (event, id) => {
    if (event.sender !== main.webContents) return;
    const entry = history.get(id);
    if (entry) send('Wyświetlono wynik z historii', { text: entry.text });
  });
  ipcMain.on('delete-history', (event, id) => {
    if (event.sender !== main.webContents) return;
    history.remove(id);
    persistState();
  });
  ipcMain.on('clear-history', event => {
    if (event.sender !== main.webContents) return;
    history.clear();
    persistState();
  });
  status.shortcut = globalShortcut.register(CAPTURE_SHORTCUT, capture);
  send(status.shortcut ? 'Gotowy do zaznaczania' : `Skrót ${CAPTURE_SHORTCUT_LABEL} jest zajęty. Zamknij aplikację, która go używa, i uruchom tę ponownie.`);
  await main.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
}
app.on('before-quit', () => {
  quitting = true;
  persistState();
  closeOverlays();
  if (globalShortcut.isRegistered(CAPTURE_SHORTCUT)) globalShortcut.unregister(CAPTURE_SHORTCUT);
  if (worker) worker.terminate();
});
module.exports = { init, show: showMain, capture };
