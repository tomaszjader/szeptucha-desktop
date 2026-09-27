const { execFile } = require('node:child_process');
const path = require('node:path');
const { promisify } = require('node:util');
const execute = promisify(execFile);

function windowsCaptureScript() {
  const script = path.join(__dirname, 'platform', 'capture-windows.ps1');
  const asar = `${path.sep}app.asar${path.sep}`;
  return script.replace(asar, `${path.sep}app.asar.unpacked${path.sep}`);
}

function usableSource(source) {
  return Boolean(source?.thumbnail && !source.thumbnail.isEmpty());
}

function sourceDisplayId(source) {
  const displayId = String(source?.display_id || '').trim();
  if (displayId) return displayId;

  // On macOS the screen source id contains the same display id that the
  // Screen API returns. This covers Electron builds where display_id is empty.
  if (process.platform === 'darwin') {
    const match = /^screen:([^:]+):0$/.exec(String(source?.id || ''));
    return match?.[1] || '';
  }
  return '';
}

function captureError() {
  const error = new Error(process.platform === 'darwin'
    ? 'macOS nie udostępnił obrazu ekranu. Włącz „Nagrywanie ekranu” dla tej aplikacji w Ustawieniach systemowych i spróbuj ponownie.'
    : 'Nie udało się dopasować obrazów do monitorów.');
  if (process.platform === 'darwin') error.code = 'SCREEN_CAPTURE_PERMISSION';
  return error;
}

function withTimeout(promise, milliseconds, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(message)), milliseconds); })
  ]).finally(() => clearTimeout(timer));
}

async function captureDisplays(displays, { desktopCapturer, screen, nativeImage }) {
  const sources = await withTimeout(desktopCapturer.getSources({ types: ['screen'], thumbnailSize: {
    width: Math.max(...displays.map(d => Math.round(d.size.width * d.scaleFactor))),
    height: Math.max(...displays.map(d => Math.round(d.size.height * d.scaleFactor)))
  }}), 8000, 'Przechwytywanie ekranu nie odpowiada.').catch(error => {
    if (process.platform !== 'win32') throw error;
    return [];
  });
  const matches = displays.map(display => sources.find(source => sourceDisplayId(source) === String(display.id) && usableSource(source)));
  if (matches.every(Boolean)) {
    return displays.map((display, index) => ({ display, image: matches[index].thumbnail }));
  }
  // A single monitor can still be captured safely when Electron omits its
  // display id. Never use this fallback with multiple monitors, where source
  // order is not a reliable mapping.
  if (displays.length === 1 && sources.length === 1 && usableSource(sources[0])) {
    return [{ display: displays[0], image: sources[0].thumbnail }];
  }
  // Empty display_id is a known Electron bug. Never guess monitor order.
  if (process.platform !== 'win32') throw captureError();
  const rectangles = displays.map(d => ({ id: String(d.id), ...screen.dipToScreenRect(null, d.bounds) }));
  const powershell = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const { stdout } = await execute(powershell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
    '-File', windowsCaptureScript(), '-Rectangles', Buffer.from(JSON.stringify(rectangles)).toString('base64')],
  { windowsHide: true, timeout: 12000, maxBuffer: 128 * 1024 * 1024, encoding: 'utf8' });
  const results = JSON.parse(stdout.replace(/^\uFEFF/, ''));
  return displays.map(display => {
    const result = results.find(r => r.id === String(display.id));
    if (!result) throw new Error('Windows nie zwrócił obrazu monitora.');
    const image = nativeImage.createFromBuffer(Buffer.from(result.png, 'base64'));
    if (image.isEmpty()) throw new Error('Windows zwrócił pusty obraz monitora.');
    return { display, image };
  });
}
module.exports = { captureDisplays, withTimeout };
