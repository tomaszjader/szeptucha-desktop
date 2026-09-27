const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizeOcrText } = require('../electron/ocr/shared/text');

test('normalizes OCR line endings and excessive blank lines', () => {
  assert.equal(normalizeOcrText('  Linia 1  \r\n\r\n\r\nLinia 2  '), 'Linia 1\n\nLinia 2');
});
