const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  createDefaultSettings,
  sanitizeSettings,
  createSettingsStore,
} = require("../electron/settings.cjs");

function makeDirectory(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "szeptucha-settings-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test("sanitizes unsupported settings and keeps valid values", () => {
  const defaults = createDefaultSettings(path.join(os.tmpdir(), "Szeptucha"));
  const result = sanitizeSettings({
    provider: "unknown",
    model: "untrusted-model",
    whisperModel: "whisper-small",
    folder: "relative/path",
    format: "exe",
    apiKey: "  secret  ",
    language: "pl",
    appLanguage: "ru",
    launchAtStartup: "false",
    saveFromShortcut: false,
  }, defaults);

  assert.equal(result.provider, "openai");
  assert.equal(result.model, "gpt-4o-mini-transcribe");
  assert.equal(result.whisperModel, "whisper-small");
  assert.equal(result.folder, defaults.folder);
  assert.equal(result.format, "md");
  assert.equal(result.apiKey, "secret");
  assert.equal(result.language, "pl");
  assert.equal(result.appLanguage, "ru");
  assert.equal(result.launchAtStartup, true);
  assert.equal(result.saveFromShortcut, false);
});

test("persists and restores settings with the API key encrypted", t => {
  const directory = makeDirectory(t);
  const filePath = path.join(directory, "settings.json");
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`encrypted:${value}`),
    decryptString: value => value.toString().replace(/^encrypted:/, ""),
  };
  const defaults = createDefaultSettings(directory);
  const store = createSettingsStore({
    getConfigPath: () => filePath,
    defaults,
    safeStorage,
    fs,
  });

  store.save({ provider: "gemini", apiKey: "secret", appLanguage: "pl" });
  const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));

  assert.equal(stored.apiKey, undefined);
  assert.equal(Buffer.from(stored.apiKeyEncrypted, "base64").toString(), "encrypted:secret");
  assert.equal(store.load().apiKey, "secret");
  assert.equal(store.load().provider, "gemini");
});

test("migrates a legacy plaintext key to encrypted storage", t => {
  const directory = makeDirectory(t);
  const filePath = path.join(directory, "settings.json");
  fs.writeFileSync(filePath, JSON.stringify({ provider: "openai", apiKey: "legacy-key" }));
  const safeStorage = {
    isEncryptionAvailable: () => true,
    encryptString: value => Buffer.from(`encrypted:${value}`),
    decryptString: value => value.toString().replace(/^encrypted:/, ""),
  };
  const store = createSettingsStore({
    getConfigPath: () => filePath,
    defaults: createDefaultSettings(directory),
    safeStorage,
    fs,
  });

  assert.equal(store.load().apiKey, "legacy-key");
  const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));
  assert.equal(stored.apiKey, undefined);
  assert.ok(stored.apiKeyEncrypted);
});

test("returns defaults when settings JSON is invalid", t => {
  const directory = makeDirectory(t);
  const filePath = path.join(directory, "settings.json");
  fs.writeFileSync(filePath, "{bad json");
  const defaults = createDefaultSettings(directory);
  const store = createSettingsStore({
    getConfigPath: () => filePath,
    defaults,
    safeStorage: { isEncryptionAvailable: () => false },
    fs,
  });

  assert.deepEqual(store.load(), defaults);
});

test("refuses to persist an API key when secure storage is unavailable", t => {
  const directory = makeDirectory(t);
  const filePath = path.join(directory, "settings.json");
  const store = createSettingsStore({
    getConfigPath: () => filePath,
    defaults: createDefaultSettings(directory),
    safeStorage: { isEncryptionAvailable: () => false },
    fs,
  });

  assert.throws(
    () => store.save({ provider: "openai", apiKey: "secret" }),
    { message: "SECURE_STORAGE_UNAVAILABLE" },
  );
  assert.equal(fs.existsSync(filePath), false);
});

test("removes a legacy plaintext API key when secure storage is unavailable", t => {
  const directory = makeDirectory(t);
  const filePath = path.join(directory, "settings.json");
  fs.writeFileSync(filePath, JSON.stringify({
    provider: "gemini",
    apiKey: "legacy-secret",
    appLanguage: "pl",
  }));
  const store = createSettingsStore({
    getConfigPath: () => filePath,
    defaults: createDefaultSettings(directory),
    safeStorage: { isEncryptionAvailable: () => false },
    fs,
  });

  const loaded = store.load();
  const stored = JSON.parse(fs.readFileSync(filePath, "utf8"));

  assert.equal(loaded.apiKey, "");
  assert.equal(loaded.provider, "gemini");
  assert.equal(stored.apiKey, undefined);
  assert.equal(stored.apiKeyEncrypted, undefined);
});
