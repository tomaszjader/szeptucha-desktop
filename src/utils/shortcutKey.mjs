// DOM KeyboardEvent.key names differ from Electron accelerator key names.
const aliases = {
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right',
  ' ': 'Space', '+': 'Plus', Enter: 'Return',
  CapsLock: 'Capslock', NumLock: 'Numlock', ScrollLock: 'Scrolllock',
  AudioVolumeUp: 'VolumeUp', AudioVolumeDown: 'VolumeDown', AudioVolumeMute: 'VolumeMute',
};
const namedKeys = new Set([
  'Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown',
  'MediaNextTrack', 'MediaPreviousTrack', 'MediaStop', 'MediaPlayPause', 'PrintScreen',
]);

export function shortcutKey(key) {
  if (Object.hasOwn(aliases, key)) return aliases[key];
  if (namedKeys.has(key) || /^F(?:[1-9]|1\d|2[0-4])$/.test(key)) return key;
  if (/^[!-~]$/.test(key)) return key.toUpperCase();
  // Modifiers, dead/composition keys and unsupported keys cannot end capture.
  return null;
}
