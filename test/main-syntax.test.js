const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const path = require("node:path");

test("Electron main process entry has valid JavaScript syntax", () => {
  assert.doesNotThrow(() => {
    execFileSync(process.execPath, ["--check", path.join(__dirname, "../electron/main.cjs")]);
  });
});
