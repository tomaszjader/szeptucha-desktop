// Runs the real app against a visible text fixture on each attached monitor.
// Invoke with Electron, not node. No screenshot or recognized user data is saved.
const { app, BrowserWindow, screen, clipboard, globalShortcut } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');
const assert = require('node:assert/strict');
const execute = require('node:util').promisify(require('node:child_process').execFile);
const appRoot = path.resolve(process.env.OCR_TEST_APP || '.');
const userData = path.join(appRoot, '.test-cache', `e2e-${process.pid}`);
fs.mkdirSync(userData, { recursive: true });
app.setPath('userData', userData);
process.env.VITE_DEV_SERVER_URL = pathToFileURL(path.join(appRoot, 'dist', 'index.html')).href;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, timeout = 20000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await delay(100); }
  throw new Error('Timed out waiting for application state');
}
const overlayWindows = () => BrowserWindow.getAllWindows().filter(w => w.webContents.getURL().endsWith('/overlay.html'));
const captureShortcut = process.platform === 'darwin' ? 'Alt+Shift+Q' : 'Super+Shift+Q';
require(path.join(appRoot, 'electron', 'main.cjs'));
let originalClipboard = '';
let lastTestText;
app.whenReady().then(async () => {
  originalClipboard = clipboard.readText();
  const main = await until(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/electron/ocr/renderer/index.html') && !w.webContents.isLoading()));
  const szeptucha = await until(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().endsWith('/dist/index.html') && !w.webContents.isLoading()));
  await until(() => szeptucha.webContents.executeJavaScript('Boolean([...document.querySelectorAll("aside nav button")].find(button => button.textContent.includes("OCR")))'));
  assert.equal(main.isVisible(), false);
  await szeptucha.webContents.executeJavaScript('[...document.querySelectorAll("aside nav button")].find(button => button.textContent.includes("OCR")).click()');
  await until(() => main.isVisible());
  console.log('PASS OCR opens from Szeptucha navigation');
  assert(globalShortcut.isRegistered(captureShortcut), 'Global shortcut must register; close the other app instance first.');
  console.log('PASS global shortcut registered');
  for (const [index, display] of screen.getAllDisplays().entries()) {
    const fixture = new BrowserWindow({ x: display.bounds.x + 60, y: display.bounds.y + 70,
      width: 900, height: 240, frame: false, thickFrame: false, show: false, alwaysOnTop: true, backgroundColor: '#ffffff' });
    await fixture.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<html><body style="margin:0;background:white;color:black;font:38px Arial;padding:45px 20px">Za\u017c\u00f3\u0142\u0107 g\u0119\u015bl\u0105 ja\u017a\u0144. Hello OCR 123.</body></html>'));
    fixture.show(); fixture.focus(); await delay(300);
    if (index === 0 && process.platform === 'win32') {
      await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(__dirname, 'press-capture-shortcut.ps1')], { windowsHide: true, timeout: 10000 });
    } else await main.webContents.executeJavaScript('document.getElementById("capture").click()');
    await until(() => overlayWindows().length === screen.getAllDisplays().length && overlayWindows().every(w => w.isVisible()));
    const overlay = overlayWindows().find(w => w.getBounds().x === display.bounds.x && w.getBounds().y === display.bounds.y);
    assert(overlay, 'An overlay must exist at the exact monitor origin');
    assert.deepEqual(overlay.getBounds(), display.bounds, 'Overlay must cover entire monitor including taskbar');
    const viewport = await overlay.webContents.executeJavaScript('({width:innerWidth,height:innerHeight,ready:document.querySelector("img").complete})');
    assert.equal(viewport.width, display.bounds.width); assert.equal(viewport.height, display.bounds.height); assert(viewport.ready);
    overlay.focus();
    overlay.webContents.sendInputEvent({ type: 'mouseDown', x: 65, y: 85, button: 'left', clickCount: 1 });
    overlay.webContents.sendInputEvent({ type: 'mouseMove', x: 940, y: 260, movementX: 875, movementY: 175 });
    await delay(100);
    const selection = await overlay.webContents.executeJavaScript('document.getElementById("selection").getBoundingClientRect().width');
    assert(selection > 800, 'Dragging must visibly draw the selection');
    overlay.webContents.sendInputEvent({ type: 'mouseUp', x: 940, y: 260, button: 'left', clickCount: 1 });
    await until(async () => !(await main.webContents.executeJavaScript('window.ocr.getStatus()')).busy, 100000);
    const state = await main.webContents.executeJavaScript('window.ocr.getStatus()');
    assert(state.text.includes('Hello OCR 123'), state.message + ': ' + state.text);
    assert(state.text.includes('Za\u017c\u00f3\u0142\u0107'), 'Polish OCR should survive the screen crop');
    assert.equal(await clipboard.readText(), state.text);
    lastTestText = state.text;
    assert.equal(overlayWindows().length, 0);
    console.log(`PASS monitor ${index + 1}: exact bounds, image loaded, drag, Polish OCR, clipboard, overlay cleanup`);
    fixture.destroy();
  }
  await main.webContents.executeJavaScript('window.ocr.capture()');
  await until(() => overlayWindows().length && overlayWindows().every(w => w.isVisible()));
  const overlay = overlayWindows()[0];
  overlay.focus(); overlay.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' });
  await until(() => overlayWindows().length === 0);
  assert.equal((await main.webContents.executeJavaScript('window.ocr.getStatus()')).busy, false);
  console.log('PASS Escape cancels and unlocks application');
  await main.webContents.executeJavaScript('window.ocr.capture()');
  await delay(50);
  await main.webContents.executeJavaScript('window.ocr.capture()');
  await delay(3500);
  assert.equal(overlayWindows().length, 0);
  assert.equal((await main.webContents.executeJavaScript('window.ocr.getStatus()')).busy, false);
  console.log('PASS cancellation during capture does not leave stale overlays');
}).catch(error => { console.error(error); app.on('will-quit', () => process.exit(1)); }).finally(async () => {
  if (lastTestText && await clipboard.readText() === lastTestText) await clipboard.writeText(await originalClipboard);
  app.quit();
});
