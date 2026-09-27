const selection = document.getElementById('selection');
let start, rect;
window.ocr.onImage(async data => {
  const image = document.getElementById('screen');
  image.src = data;
  try { await image.decode(); window.ocr.imageReady(true); }
  catch { window.ocr.imageReady(false); }
});
function update(event) {
  const x = Math.max(0, Math.min(innerWidth, event.clientX));
  const y = Math.max(0, Math.min(innerHeight, event.clientY));
  rect = { x: Math.min(start.x, x), y: Math.min(start.y, y), width: Math.abs(x - start.x), height: Math.abs(y - start.y) };
  Object.assign(selection.style, { display: 'block', left: `${rect.x}px`, top: `${rect.y}px`, width: `${rect.width}px`, height: `${rect.height}px` });
}
document.addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  start = { x: event.clientX, y: event.clientY };
  document.body.setPointerCapture(event.pointerId);
  document.getElementById('shade').style.display = 'none';
  document.getElementById('hint').style.display = 'none';
  update(event);
});
document.addEventListener('pointermove', event => { if (start) update(event); });
document.addEventListener('pointerup', event => {
  if (!start) return;
  update(event); start = null;
  if (rect.width >= 3 && rect.height >= 3) window.ocr.select(rect);
  else window.ocr.cancel();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') window.ocr.cancel(); });
document.addEventListener('contextmenu', event => { event.preventDefault(); window.ocr.cancel(); });
