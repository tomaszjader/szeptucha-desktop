const { test } = require('node:test');
const assert = require('node:assert/strict');
const { cropRectangle } = require('../electron/ocr/shared/geometry');
test('maps logical coordinates to screenshot pixels at 150% DPI', () => {
  assert.deepEqual(cropRectangle({ x: 100, y: 50, width: 200, height: 100 }, { width: 1920, height: 1080 }, { width: 2880, height: 1620 }), { x: 150, y: 75, width: 300, height: 150 });
});
test('clips selection at image boundary', () => {
  assert.deepEqual(cropRectangle({ x: 90, y: 90, width: 20, height: 20 }, { width: 100, height: 100 }, { width: 100, height: 100 }), { x: 90, y: 90, width: 10, height: 10 });
});
test('rejects malformed and empty selections', () => {
  for (const rect of [null, {}, { x: NaN, y: 0, width: 5, height: 5 }, { x: 0, y: 0, width: 0, height: 1 }]) assert.throws(() => cropRectangle(rect, { width: 100, height: 100 }, { width: 100, height: 100 }));
});
