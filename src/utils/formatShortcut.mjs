/** Format an Electron accelerator for display without changing the stored binding. */
export function formatShortcut(value, platform = globalThis.navigator?.platform ?? "") {
  if (!value) return "";
  const isMac = /mac|darwin/i.test(platform);
  const isWindows = /win/i.test(platform) && !isMac;
  const metaLabel = isMac ? "⌘" : isWindows ? "Win" : "Super";
  return value.split("+").map(part => {
    const key = part.trim();
    switch (key.toLowerCase()) {
      case "commandorcontrol":
      case "cmdorctrl": return isMac ? "⌘" : "Ctrl";
      case "control":
      case "ctrl": return "Ctrl";
      case "command":
      case "cmd": return "⌘";
      case "super":
      case "meta": return metaLabel;
      case "windows":
      case "win": return "Win";
      case "alt":
      case "option": return isMac ? "Option" : "Alt";
      case "shift": return "Shift";
      default: return /^key[a-z]$/i.test(key) ? key.slice(3).toUpperCase() : key;
    }
  }).join("+");
}
