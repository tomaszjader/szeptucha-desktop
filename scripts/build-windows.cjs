const { spawn } = require("node:child_process");

function isTransientDownloadError(output) {
  const networkFailure = /(?:response|status)\s+code\s*:?\s*(?:408|429|500|502|503|504)\b|\b(?:ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ECONNREFUSED)\b|socket hang\s?up|connection (?:reset|timed out)/i;
  const downloadContext = /download|https?:\/\/|HTTPError|node_modules[\\/]got[\\/]/i;
  return networkFailure.test(output) && downloadContext.test(output);
}

function runBuilder() {
  return new Promise((resolve, reject) => {
    // Run the installed CLI directly, without a shell or implicit release publishing.
    const child = spawn(process.execPath, [require.resolve("electron-builder/cli.js"), "--win", "--publish", "never"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    const forward = destination => chunk => {
      destination.write(chunk);
      output = (output + chunk.toString()).slice(-64 * 1024);
    };
    child.stdout.on("data", forward(process.stdout));
    child.stderr.on("data", forward(process.stderr));
    child.once("error", reject);
    child.once("close", code => resolve({ code: code ?? 1, output }));
  });
}

async function buildWithRetry({
  run = runBuilder,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
  maxAttempts = 3,
  log = console.warn,
} = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const result = await run();
    if (result.code === 0 || !isTransientDownloadError(result.output) || attempt === maxAttempts) return result.code;
    const delayMs = attempt * 10_000;
    log(`Temporary installer download failure. Retrying packaging (${attempt + 1}/${maxAttempts}) in ${delayMs / 1000}s.`);
    await wait(delayMs);
  }
  throw new Error("maxAttempts must be a positive integer");
}

if (require.main === module) {
  buildWithRetry().then(code => { process.exitCode = code; }).catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { buildWithRetry, isTransientDownloadError };
