const captureButton = document.getElementById('capture');
const captureLabel = document.getElementById('capture-label');
const captureDescription = document.getElementById('capture-description');
const copyButton = document.getElementById('copy');
const clearButton = document.getElementById('clear');
const result = document.getElementById('result');
const statusElement = document.getElementById('status');
const captureHint = document.getElementById('capture-hint');
const engineBadge = document.getElementById('engine-badge');
const engineBadgeText = document.getElementById('engine-badge-text');
const systemCopy = document.getElementById('system-copy');
const resultState = document.getElementById('result-state');
const resultEmpty = document.getElementById('result-empty');
const resultEmptyTitle = document.getElementById('result-empty-title');
const resultEmptyCopy = document.getElementById('result-empty-copy');
const resultLoading = document.getElementById('result-loading');
const confidence = document.getElementById('confidence');
const charCount = document.getElementById('char-count');
const wordCount = document.getElementById('word-count');
let currentStatus = { busy: false, phase: 'idle', text: '', copyNotice: '' };
let lastHistoryText = '';
let toastTimer;
let currentSettings = { keepHistory: true, persistHistory: false };

const shortcutModifier = document.getElementById('shortcut-modifier');
const shortcutGuide = document.getElementById('shortcut-guide');
if (window.ocr.platform === 'darwin') {
  shortcutModifier.textContent = '⌥';
  shortcutGuide.textContent = 'Wciśnij ⌥ + Shift + Q w dowolnej aplikacji.';
} else if (window.ocr.platform !== 'win32') {
  shortcutModifier.textContent = 'Super';
  shortcutGuide.textContent = 'Wciśnij Super + Shift + Q w dowolnej aplikacji.';
}

function classify(status) {
  const message = status.message || '';
  if (status.busy) return 'scanning';
  if (/^(Błąd|Nie znaleziono|Schowek)/i.test(message)) return 'error';
  if (status.text) return 'success';
  return 'ready';
}

function showToast(message) {
  if (!message) return;
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { toast.hidden = true; }, 2600);
}

function render(status) {
  currentStatus = status;
  const state = classify(status);
  const text = status.text || '';
  const hasText = Boolean(text);
  document.body.dataset.state = state;
  document.body.dataset.hasText = String(hasText);

  statusElement.textContent = status.message;
  captureHint.textContent = status.busy ? (status.phase === 'ocr' ? 'Kliknij lub użyj skrótu, aby anulować' : 'Kliknij, aby anulować') : state === 'success' ? 'Odczyt gotowy do wklejenia' : 'Gotowy do zaznaczania';
  result.value = text;
  captureButton.disabled = false;
  captureButton.classList.toggle('is-cancel', status.busy);
  captureLabel.textContent = status.busy && status.phase === 'ocr' ? 'Anuluj OCR' : status.busy ? 'Anuluj zaznaczanie' : 'Zaznacz fragment ekranu';
  captureDescription.textContent = status.busy && status.phase === 'ocr' ? 'KLIKNIJ LUB SKRÓT, ABY PRZERWAĆ' : status.busy ? 'ESC LUB KLIKNIJ, ABY ANULOWAĆ' : 'AUTOMATYCZNE ROZPOZNANIE OCR';
  copyButton.disabled = !hasText || status.busy;
  clearButton.disabled = !hasText || status.busy;
  charCount.textContent = text.length;
  wordCount.textContent = text.trim() ? text.trim().split(/\s+/).length : 0;

  resultState.textContent = state === 'scanning' ? 'SKANOWANIE' : state === 'success' ? 'SUKCES' : state === 'error' ? 'BŁĄD' : 'GOTOWY';
  engineBadge.classList.toggle('is-busy', state === 'scanning');
  engineBadge.classList.toggle('is-error', state === 'error');
  engineBadgeText.textContent = state === 'scanning' ? 'Skanowanie lokalne' : state === 'error' ? 'Wymaga uwagi' : 'Lokalnie na komputerze';
  systemCopy.textContent = state === 'scanning' ? 'SILNIK LOKALNY: SKANOWANIE…' : state === 'error' ? 'SILNIK LOKALNY: SPRAWDŹ STAN' : 'SILNIK LOKALNY: AKTYWNY';
  confidence.textContent = state === 'scanning' ? 'Rozpoznawanie w pamięci RAM…' : state === 'success' ? 'Gotowe do skopiowania' : state === 'error' ? 'Spróbuj ponownie' : 'Gotowy do pracy';

  resultLoading.hidden = state !== 'scanning';
  resultEmpty.hidden = state === 'scanning' || hasText;
  if (state === 'error') {
    resultEmptyTitle.textContent = 'Nie udało się odczytać tekstu';
    resultEmptyCopy.textContent = status.message.replace(/^Błąd OCR:\s*/i, '') || 'Zaznacz wyraźniejszy fragment i spróbuj ponownie.';
  } else {
    resultEmptyTitle.textContent = 'Czekam na zaznaczenie';
    resultEmptyCopy.textContent = 'Zaznacz fragment ekranu, aby rozpoznać tekst lokalnie.';
  }
  if (status.copyNotice) showToast(status.copyNotice);
  if (text && text !== lastHistoryText) { lastHistoryText = text; refreshHistory(); }
  if (!text) lastHistoryText = '';
}

function hideDrawers() {
  ['history-panel', 'models-panel', 'settings-panel', 'info-panel'].forEach(id => { document.getElementById(id).hidden = true; });
}

function openView(view) {
  hideDrawers();
  document.querySelectorAll('.nav-item').forEach(item => item.classList.toggle('is-active', item.dataset.view === view));
  if (view === 'history') { document.getElementById('history-panel').hidden = false; refreshHistory(); }
  if (view === 'models') document.getElementById('models-panel').hidden = false;
  if (view === 'settings') document.getElementById('settings-panel').hidden = false;
}

async function refreshHistory() {
  const list = document.getElementById('history-list');
  const count = document.getElementById('history-count');
  const entries = await window.ocr.getHistory();
  count.textContent = `${entries.length} ${entries.length === 1 ? 'wpis' : 'wpisów'} · ${currentSettings.persistHistory ? 'zapis między uruchomieniami włączony' : 'tylko w pamięci'}`;
  list.replaceChildren();
  if (!entries.length) {
    const empty = document.createElement('div');
    empty.className = 'history-empty';
    empty.textContent = 'Historia jest pusta. Wyniki pojawią się tutaj po pierwszym odczycie.';
    list.appendChild(empty);
    return;
  }
  entries.forEach(entry => {
    const item = document.createElement('article');
    item.className = 'history-item';
    const content = document.createElement('div');
    const time = document.createElement('time');
    time.dateTime = entry.createdAt;
    time.textContent = new Intl.DateTimeFormat('pl-PL', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(entry.createdAt));
    const preview = document.createElement('p');
    preview.textContent = entry.text;
    content.append(time, preview);
    const actions = document.createElement('div');
    actions.className = 'history-actions';
    const restore = document.createElement('button');
    restore.type = 'button'; restore.title = 'Przywróć wynik'; restore.setAttribute('aria-label', 'Przywróć wynik'); restore.textContent = '↺';
    restore.addEventListener('click', () => { window.ocr.restoreHistory(entry.id); openView('readout'); });
    const copy = document.createElement('button');
    copy.type = 'button'; copy.title = 'Kopiuj wynik'; copy.setAttribute('aria-label', 'Kopiuj wynik'); copy.textContent = '▣';
    copy.addEventListener('click', () => window.ocr.copyHistory(entry.id));
    const remove = document.createElement('button');
    remove.type = 'button'; remove.title = 'Usuń wpis'; remove.setAttribute('aria-label', 'Usuń wpis'); remove.textContent = '×';
    remove.addEventListener('click', async () => { window.ocr.deleteHistory(entry.id); await refreshHistory(); });
    actions.append(restore, copy, remove);
    item.append(content, actions);
    list.appendChild(item);
  });
}

window.ocr.onStatus(render);
window.ocr.getStatus().then(render);
captureButton.addEventListener('click', () => { if (currentStatus.busy) window.ocr.cancel(); else window.ocr.capture(); });
copyButton.addEventListener('click', () => window.ocr.copy());
clearButton.addEventListener('click', () => window.ocr.clear());

document.querySelectorAll('.nav-item').forEach(item => item.addEventListener('click', () => openView(item.dataset.view)));
document.getElementById('clear-history').addEventListener('click', async () => { window.ocr.clearHistory(); await refreshHistory(); showToast('Historia została wyczyszczona.'); });
['history-close', 'models-close', 'settings-close'].forEach(id => document.getElementById(id).addEventListener('click', () => openView('readout')));

const guideToggle = document.getElementById('guide-toggle');
const guideContent = document.getElementById('guide-content');
guideToggle.addEventListener('click', () => {
  const expanded = guideToggle.getAttribute('aria-expanded') === 'true';
  guideToggle.setAttribute('aria-expanded', String(!expanded));
  guideContent.hidden = expanded;
});

document.getElementById('info-button').addEventListener('click', () => { hideDrawers(); document.getElementById('info-panel').hidden = false; });
document.getElementById('info-close').addEventListener('click', () => { document.getElementById('info-panel').hidden = true; });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') hideDrawers();
  if (event.altKey && event.key.toLowerCase() === 's') { event.preventDefault(); openView('readout'); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'h') { event.preventDefault(); openView('history'); }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 't') { event.preventDefault(); openView('models'); }
  if (event.altKey && event.key === ',') { event.preventDefault(); openView('settings'); }
});

window.ocr.getSettings().then(settings => {
  currentSettings = settings;
  document.querySelectorAll('[data-setting]').forEach(input => { input.checked = Boolean(settings[input.dataset.setting]); });
});
document.querySelectorAll('[data-setting]').forEach(input => input.addEventListener('change', () => {
  currentSettings[input.dataset.setting] = input.checked;
  window.ocr.setSettings({ [input.dataset.setting]: input.checked });
  showToast(input.dataset.setting === 'keepHistory' && !input.checked ? 'Historia została usunięta.' : 'Ustawienie zapisane.');
  if (input.dataset.setting === 'persistHistory' || input.dataset.setting === 'keepHistory') refreshHistory();
}));
