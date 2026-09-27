const { test } = require('node:test');
const assert = require('node:assert/strict');
const { captureDisplays, withTimeout } = require('../electron/ocr/main/capture');
test('pairs explicit display IDs even when source order differs', async () => {
  const a = { isEmpty: () => false }, b = { isEmpty: () => false };
  const displays = [1, 2].map(id => ({ id, size: { width: 100, height: 100 }, scaleFactor: 1 }));
  const captures = await captureDisplays(displays, { desktopCapturer: { getSources: async () => [
    { display_id: '2', thumbnail: b }, { display_id: '1', thumbnail: a }
  ] }});
  assert.equal(captures[0].image, a); assert.equal(captures[1].image, b);
});
test('unresponsive operations time out instead of leaving capture busy indefinitely', async () => {
  await assert.rejects(withTimeout(new Promise(() => {}), 20, 'timeout'), /timeout/);
  assert.equal(await withTimeout(Promise.resolve('ok'), 20, 'timeout'), 'ok');
});
