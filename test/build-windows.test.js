const test = require("node:test");
const assert = require("node:assert/strict");
const { buildWithRetry, isTransientDownloadError } = require("../scripts/build-windows.cjs");

const gatewayTimeout = "downloaded nsis-3.0.4.1.7z\nHTTPError: Response code 504 (Gateway Time-out) failedTask=build";

test("recognizes the observed installer HTTP 504 failure and other temporary download errors", () => {
  assert.equal(isTransientDownloadError(gatewayTimeout), true);
  for (const code of [408, 429, 500, 502, 503, 504]) {
    assert.equal(isTransientDownloadError(`Download failed: Response code ${code}`), true);
  }
  for (const code of ["ETIMEDOUT", "ECONNRESET", "EAI_AGAIN"]) {
    assert.equal(isTransientDownloadError(`Electron download failed: ${code}`), true);
  }
});

test("does not classify permanent HTTP, integrity, signing or packaging errors as retryable downloads", () => {
  for (const output of [
    "Download failed: Response code 404", "HTTPError: Response code 403",
    "HTTPError: Response code 401", "Installer checksum mismatch",
    "Cannot find module missing-package", "NSIS compilation failed",
    "Signing certificate is invalid", "TypeScript error TS5042",
    "An unrelated operation failed: ETIMEDOUT",
  ]) assert.equal(isTransientDownloadError(output), false, output);
});

function fixture(results) {
  let calls = 0;
  const delays = [];
  const messages = [];
  return {
    options: {
      run: async () => { const result = results[calls]; calls += 1; assert.ok(result, "no unexpected extra attempt"); return result; },
      wait: async ms => { delays.push(ms); },
      log: message => messages.push(message),
    },
    calls: () => calls,
    delays,
    messages,
  };
}

test("successful packaging runs only once", async () => {
  const f = fixture([{ code: 0, output: "done" }]);
  assert.equal(await buildWithRetry(f.options), 0);
  assert.equal(f.calls(), 1);
  assert.deepEqual(f.delays, []);
});

test("retries the real 504 signature and succeeds without hiding the failed first attempt", async () => {
  const f = fixture([{ code: 1, output: gatewayTimeout }, { code: 0, output: "done" }]);
  assert.equal(await buildWithRetry(f.options), 0);
  assert.equal(f.calls(), 2);
  assert.deepEqual(f.delays, [10_000]);
  assert.match(f.messages[0], /2\/3/);
});

test("stops after three temporary failures and preserves the failing exit code", async () => {
  const f = fixture(Array.from({ length: 3 }, () => ({ code: 7, output: gatewayTimeout })));
  assert.equal(await buildWithRetry(f.options), 7);
  assert.equal(f.calls(), 3);
  assert.deepEqual(f.delays, [10_000, 20_000]);
});

test("a permanent error on the first attempt is returned immediately", async () => {
  const f = fixture([{ code: 2, output: "NSIS compilation failed" }]);
  assert.equal(await buildWithRetry(f.options), 2);
  assert.equal(f.calls(), 1);
  assert.deepEqual(f.delays, []);
});

test("a permanent failure after a temporary failure stops further attempts", async () => {
  const f = fixture([{ code: 1, output: gatewayTimeout }, { code: 2, output: "Invalid signing certificate" }]);
  assert.equal(await buildWithRetry(f.options), 2);
  assert.equal(f.calls(), 2);
  assert.deepEqual(f.delays, [10_000]);
});

test("process startup failures are propagated without retrying", async () => {
  let calls = 0;
  await assert.rejects(buildWithRetry({ run: async () => { calls += 1; throw new Error("ENOENT"); } }), /ENOENT/);
  assert.equal(calls, 1);
});
