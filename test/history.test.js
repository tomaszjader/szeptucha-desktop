const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHistoryStore } = require('../electron/ocr/main/history');

test('history keeps newest unique OCR results within its limit', () => {
  const history = createHistoryStore(2);
  history.add({ id: 'a', text: 'pierwszy' });
  history.add({ id: 'b', text: 'drugi' });
  history.add({ id: 'c', text: 'trzeci' });
  assert.deepEqual(history.list().map(item => item.text), ['trzeci', 'drugi']);
  history.add({ id: 'd', text: 'drugi' });
  assert.deepEqual(history.list().map(item => item.text), ['drugi', 'trzeci']);
});

test('history supports restore, remove and clear operations', () => {
  const history = createHistoryStore();
  history.add({ id: 'a', text: 'tekst' });
  assert.equal(history.get('a').text, 'tekst');
  history.remove('a');
  assert.equal(history.get('a'), null);
  history.add({ id: 'b', text: 'inny tekst' });
  history.clear();
  assert.deepEqual(history.list(), []);
});

test('history loads valid entries, removes duplicates and respects its limit', () => {
  const history = createHistoryStore(2);
  history.load([
    { id: 'a', text: 'pierwszy', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'b', text: 'pierwszy', createdAt: '2026-01-01T00:01:00.000Z' },
    { id: 'c', text: 'drugi', createdAt: '2026-01-01T00:02:00.000Z' },
    { id: 'invalid', text: '', createdAt: '2026-01-01T00:03:00.000Z' }
  ]);
  assert.deepEqual(history.list().map(({ id, text }) => ({ id, text })), [
    { id: 'a', text: 'pierwszy' },
    { id: 'c', text: 'drugi' }
  ]);
});
