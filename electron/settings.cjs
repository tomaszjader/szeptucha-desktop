function createDefaultSettings(defaultFolder) {
  return {
    provider: "openai",
    apiKey: "",
    model: "gpt-4o-mini-transcribe",
    whisperModel: "whisper-tiny",
    folder: defaultFolder,
    format: "md",
    recordHotkey: "CommandOrControl+Shift+R",
    correctHotkey: "CommandOrControl+Q",
    launchAtStartup: false,
    language: "auto",
    saveFromInterface: true,
    saveFromShortcut: true,
    appLanguage: "system",
    soundEnabled: true,
  };
}

function limitedString(value, fallback, maxLength = 500) {
  return typeof value === "string" && value.length <= maxLength
    ? value
    : fallback;
}

function sanitizeSettings(value = {}, defaults) {
  const providers = new Set(["openai", "gemini", "local"]);
  const formats = new Set(["md", "txt", "json"]);
  const appLanguages = new Set(["system", "pl", "en", "de", "ru"]);
  const recordingLanguages = new Set(["auto", "pl", "en", "de", "ru"]);
  const whisperModels = new Set(["whisper-tiny", "whisper-base", "whisper-small"]);
  const providerModels = {
    openai: new Set(["gpt-4o-mini-transcribe"]),
    gemini: new Set(["gemini-2.0-flash"]),
    local: whisperModels,
  };
  const source = value && typeof value === "object" ? value : {};
  const provider = providers.has(source.provider)
    ? source.provider
    : defaults.provider;
  const requestedModel = limitedString(source.model, "", 200);
  const model = providerModels[provider].has(requestedModel)
    ? requestedModel
    : provider === "openai"
      ? "gpt-4o-mini-transcribe"
      : provider === "gemini"
        ? "gemini-2.0-flash"
        : "whisper-tiny";
  const requestedFolder = limitedString(source.folder, defaults.folder, 32_000);
  return {
    ...defaults,
    provider,
    apiKey: limitedString(source.apiKey, "", 10_000).trim(),
    model,
    whisperModel: whisperModels.has(source.whisperModel)
      ? source.whisperModel
      : defaults.whisperModel,
    folder: require("node:path").isAbsolute(requestedFolder)
      ? requestedFolder
      : defaults.folder,
    format: formats.has(source.format) ? source.format : defaults.format,
    recordHotkey: limitedString(source.recordHotkey, defaults.recordHotkey, 200),
    correctHotkey: limitedString(source.correctHotkey, defaults.correctHotkey, 200),
    launchAtStartup: Boolean(source.launchAtStartup),
    language: recordingLanguages.has(source.language)
      ? source.language
      : defaults.language,
    saveFromInterface:
      typeof source.saveFromInterface === "boolean"
        ? source.saveFromInterface
        : defaults.saveFromInterface,
    saveFromShortcut:
      typeof source.saveFromShortcut === "boolean"
        ? source.saveFromShortcut
        : defaults.saveFromShortcut,
    appLanguage: appLanguages.has(source.appLanguage)
      ? source.appLanguage
      : defaults.appLanguage,
    soundEnabled:
      typeof source.soundEnabled === "boolean"
        ? source.soundEnabled
        : defaults.soundEnabled,
  };
}

function createSettingsStore({ getConfigPath, defaults, safeStorage, fs }) {
  function decryptApiKey(value) {
    if (!value || !safeStorage.isEncryptionAvailable()) return "";
    try {
      return safeStorage.decryptString(Buffer.from(value, "base64"));
    } catch {
      return "";
    }
  }

  function load() {
    try {
      const stored = JSON.parse(fs.readFileSync(getConfigPath(), "utf8"));
      const encryptionAvailable = safeStorage.isEncryptionAvailable();
      const hasLegacyPlaintextKey =
        typeof stored.apiKey === "string" && stored.apiKey.length > 0;
      const apiKey = stored.apiKeyEncrypted
        ? decryptApiKey(stored.apiKeyEncrypted)
        : encryptionAvailable
          ? limitedString(stored.apiKey, "", 10_000)
          : "";
      const result = sanitizeSettings({ ...stored, apiKey }, defaults);
      // Migrate legacy plaintext keys when possible. If encryption is unavailable,
      // remove the exposed key from disk and continue without it.
      if (hasLegacyPlaintextKey) save(result);
      return result;
    } catch {
      return { ...defaults };
    }
  }

  function save(value) {
    const sanitized = sanitizeSettings(value, defaults);
    const stored = { ...sanitized };
    if (stored.apiKey && !safeStorage.isEncryptionAvailable()) {
      throw new Error("SECURE_STORAGE_UNAVAILABLE");
    }
    if (stored.apiKey) {
      stored.apiKeyEncrypted = safeStorage
        .encryptString(stored.apiKey)
        .toString("base64");
      delete stored.apiKey;
    }
    fs.mkdirSync(require("node:path").dirname(getConfigPath()), { recursive: true });
    const temporaryPath = getConfigPath() + ".tmp";
    fs.writeFileSync(temporaryPath, JSON.stringify(stored, null, 2), "utf8");
    fs.renameSync(temporaryPath, getConfigPath());
    return sanitized;
  }

  return { load, save };
}

module.exports = { createDefaultSettings, sanitizeSettings, createSettingsStore };
