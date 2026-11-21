const test = require('node:test');
const assert = require('node:assert/strict');
const mapper = import('../src/utils/shortcutKey.mjs');

test('arrow keys use Electron names rather than DOM names', async () => {
  const { shortcutKey } = await mapper;
  for (const direction of ['Up', 'Down', 'Left', 'Right']) {
    assert.equal(shortcutKey(`Arrow${direction}`), direction);
  }
});

test('plus is a key token, not an extra accelerator separator', async () => {
  const { shortcutKey } = await mapper;
  assert.equal(['Control', shortcutKey('+')].join('+'), 'Control+Plus');
  assert.equal(shortcutKey(' '), 'Space');
  assert.equal(shortcutKey('Enter'), 'Return');
});

test('navigation, editing and function keys keep supported names', async () => {
  const { shortcutKey } = await mapper;
  for (const key of ['Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'PrintScreen', 'F1', 'F12', 'F24']) {
    assert.equal(shortcutKey(key), key);
  }
  for (const [key, expected] of [['CapsLock', 'Capslock'], ['NumLock', 'Numlock'], ['ScrollLock', 'Scrolllock']]) {
    assert.equal(shortcutKey(key), expected);
  }
});

test('media keys use Electron volume names and preserve track controls', async () => {
  const { shortcutKey } = await mapper;
  for (const [key, expected] of [['AudioVolumeUp', 'VolumeUp'], ['AudioVolumeDown', 'VolumeDown'], ['AudioVolumeMute', 'VolumeMute']]) {
    assert.equal(shortcutKey(key), expected);
  }
  for (const key of ['MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause']) assert.equal(shortcutKey(key), key);
});

test('letters, numbers and punctuation remain usable', async () => {
  const { shortcutKey } = await mapper;
  for (const key of ['a', 'Z', '0', '9', '-', '=', '/', ';', ',', '.', '[', ']', '\\']) {
    assert.equal(shortcutKey(key), key.toUpperCase());
  }
});

test('modifiers and unsupported input do not produce invalid accelerators', async () => {
  const { shortcutKey } = await mapper;
  for (const key of ['Control', 'Shift', 'Alt', 'Meta', 'AltGraph', 'Escape', 'Dead', 'Process', 'Unidentified', 'F25', 'ą', 'ß', '']) {
    assert.equal(shortcutKey(key), null);
  }
});
