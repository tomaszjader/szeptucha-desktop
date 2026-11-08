const definitions = [
  { id: "recording", field: "recordHotkey" },
  { id: "correction", field: "correctHotkey" },
];

function canonicalAccelerator(value, platform = process.platform) {
  if (typeof value !== "string" || !value.trim()) return "";
  let accelerator = value.trim().toLowerCase();
  if (accelerator === "+") accelerator = "plus";
  else if (accelerator.endsWith("++")) accelerator = accelerator.slice(0, -1) + "plus";
  const aliases = {
    ctrl: "control", cmd: "meta", command: "meta", super: "meta", win: "meta", windows: "meta",
    option: "alt", cmdorctrl: platform === "darwin" ? "meta" : "control",
    commandorcontrol: platform === "darwin" ? "meta" : "control",
    esc: "escape", return: "enter",
  };
  return [...new Set(accelerator.split("+").map(part => {
    const key = part.trim();
    return aliases[key] || key;
  }))].sort().join("+");
}

function createShortcutManager({ globalShortcut, actions, onState = () => {}, platform = process.platform, logger = console }) {
  let owned = [];
  let state = null;
  const duplicate = settings => {
    const first = canonicalAccelerator(settings.recordHotkey, platform);
    return Boolean(first && first === canonicalAccelerator(settings.correctHotkey, platform));
  };
  const getState = () => state && Object.fromEntries(Object.entries(state).map(([id, item]) => [id, { ...item }]));
  return {
    validate(settings) {
      if (duplicate(settings)) throw new Error("SHORTCUT_CONFLICT");
    },
    apply(settings) {
      for (const accelerator of owned) globalShortcut.unregister(accelerator);
      owned = [];
      const conflict = duplicate(settings);
      state = {};
      for (const { id, field } of definitions) {
        const accelerator = settings[field] || "";
        let status = accelerator ? "unavailable" : "disabled";
        if (accelerator && conflict) status = "conflict";
        else if (accelerator) {
          try {
            // Do not replace a shortcut owned by another part of this app (e.g. OCR).
            if (!globalShortcut.isRegistered(accelerator) && globalShortcut.register(accelerator, actions[id])) {
              owned.push(accelerator);
              status = "active";
            }
          } catch (error) {
            logger.error(`Could not register ${id} shortcut`, error);
          }
        }
        state[id] = { accelerator, status };
      }
      onState(getState());
      return getState();
    },
    getState,
  };
}

module.exports = { canonicalAccelerator, createShortcutManager };
