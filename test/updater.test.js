const test = require("node:test");
const assert = require("node:assert/strict");
const { compareVersions, parseSha256Manifest, hashesMatch } = require("../electron/updater.cjs");

test("compares stable semantic versions", () => {
  assert.equal(compareVersions("0.2.0", "0.1.9"), 1);
  assert.equal(compareVersions("1.0.0", "1.0.0"), 0);
  assert.equal(compareVersions("1.2.3", "1.3.0"), -1);
});

test("accepts a v prefix and ignores release metadata", () => {
  assert.equal(compareVersions("v1.2.3", "1.2.2"), 1);
  assert.equal(compareVersions("1.2.3+build.4", "1.2.3"), 0);
});

test("does not treat invalid version strings as updates", () => {
  assert.equal(compareVersions("nightly", "1.0.0"), 0);
  assert.equal(compareVersions("1.0", "0.9.0"), 0);
});

test("provides every update dialog message in all supported languages", () => {
  const { mainTranslations } = require("../electron/translations.cjs");
  const keys = [
    "updateTitle",
    "updateAvailable",
    "updateDownloadQuestion",
    "updateDownload",
    "updateLater",
    "updateDownloaded",
    "updateInstallDetail",
    "updateInstallNow",
    "updateFailed",
  ];

  for (const [language, messages] of Object.entries(mainTranslations)) {
    for (const key of keys) {
      assert.equal(typeof messages[key], "string", `${language} is missing ${key}`);
      assert.ok(messages[key].length > 0, `${language} has an empty ${key}`);
    }
  }
  assert.ok(Object.values(mainTranslations).every(
    messages => messages.updateAvailable.includes("{version}"),
  ));
});

test("reads the checksum only for the exact installer filename", () => {
  const checksum = "a".repeat(64);
  const manifest = `${checksum}  Szeptucha-Setup-0.2.0.exe\\r\\n`;

  assert.equal(
    parseSha256Manifest(manifest, "Szeptucha-Setup-0.2.0.exe"),
    checksum,
  );
  assert.equal(
    parseSha256Manifest(manifest, "Szeptucha-Setup-0.3.0.exe"),
    null,
  );
  assert.equal(parseSha256Manifest("invalid checksum", "setup.exe"), null);
});

test("compares SHA-256 digests and rejects malformed values", () => {
  const checksum = "a".repeat(64);

  assert.equal(hashesMatch(checksum, checksum), true);
  assert.equal(hashesMatch(checksum, "b".repeat(64)), false);
  assert.equal(hashesMatch("not-a-hash", checksum), false);
});
