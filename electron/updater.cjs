const https = require("https");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

const OWNER = "tomaszjader";
const REPOSITORY = "szeptucha-desktop";
const MAX_INSTALLER_BYTES = 500 * 1024 * 1024;

function compareVersions(left, right) {
  const parse = value => {
    const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(value || "");
    return match ? match.slice(1, 4).map(Number) : null;
  };
  const a = parse(left);
  const b = parse(right);
  if (!a || !b) return 0;
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] > b[i] ? 1 : -1;
  }
  return 0;
}

function parseSha256Manifest(contents, fileName) {
  for (const line of String(contents).split(/\\r?\\n/)) {
    const match = /^([a-f0-9]{64})[ \\t]+\\*?(.+)$/.exec(line.trim());
    if (match && match[2].trim() === fileName) return match[1].toLowerCase();
  }
  return null;
}

function hashesMatch(expected, actual) {
  if (!/^[a-f0-9]{64}$/i.test(expected || "") ||
      !/^[a-f0-9]{64}$/i.test(actual || "")) return false;
  return crypto.timingSafeEqual(
    Buffer.from(expected, "hex"),
    Buffer.from(actual, "hex"),
  );
}

function isGitHubAsset(asset) {
  return asset &&
    typeof asset.browser_download_url === "string" &&
    asset.browser_download_url.startsWith("https://github.com/");
}

async function downloadChecksumManifest(asset) {
  if (!isGitHubAsset(asset)) throw new Error("Invalid checksum manifest URL");
  const response = await get(asset.browser_download_url, {
    "User-Agent": "Szeptucha-Desktop",
  });
  if (response.statusCode !== 200) {
    response.resume();
    throw new Error(`Checksum manifest download failed: ${response.statusCode}`);
  }
  let manifest = "";
  for await (const chunk of response) {
    manifest += chunk.toString("utf8");
    if (manifest.length > 64 * 1024) {
      response.destroy();
      throw new Error("Checksum manifest is too large");
    }
  }
  return manifest;
}

function get(url, headers = {}, redirects = 0) {
  return new Promise((resolve, reject) => {
    if (redirects > 5) return reject(new Error("Too many download redirects"));
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || !["api.github.com", "github.com", "objects.githubusercontent.com", "release-assets.githubusercontent.com"].includes(parsed.hostname)) return reject(new Error("Untrusted update host"));
    const request = https.get(parsed, { headers, timeout: 30_000 }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        const location = response.headers.location;
        response.resume();
        if (!location) return reject(new Error("Missing redirect location"));
        return resolve(get(new URL(location, parsed).toString(), headers, redirects + 1));
      }
      resolve(response);
    });
    request.on("timeout", () => request.destroy(new Error("Request timed out")));
    request.on("error", reject);
  });
}

async function latestRelease() {
  const response = await get(
    `https://api.github.com/repos/${OWNER}/${REPOSITORY}/releases/latest`,
    { "User-Agent": "Szeptucha-Desktop", Accept: "application/vnd.github+json" },
  );
  if (response.statusCode !== 200) {
    response.resume();
    throw new Error(`GitHub release check failed: ${response.statusCode}`);
  }
  let body = "";
  for await (const chunk of response) {
    body += chunk;
    if (body.length > 2 * 1024 * 1024) throw new Error("Release metadata is too large");
  }
  return JSON.parse(body);
}

async function downloadInstaller(asset, destination) {
  if (!asset || typeof asset.browser_download_url !== "string" ||
      !asset.browser_download_url.startsWith("https://github.com/")) {
    throw new Error("Invalid installer download URL");
  }
  if (!/^[a-f0-9]{64}$/i.test(expectedSha256 || "")) {\n    throw new Error("Invalid expected installer checksum");\n  }\n  if (asset.size > MAX_INSTALLER_BYTES) throw new Error("Installer is too large");
  const response = await get(asset.browser_download_url, { "User-Agent": "Szeptucha-Desktop" });
  if (response.statusCode !== 200) {
    response.resume();
    throw new Error(`Installer download failed: ${response.statusCode}`);
  }
  const declaredLength = Number(response.headers["content-length"]);
  if (declaredLength > MAX_INSTALLER_BYTES) {
    response.destroy();
    throw new Error("Installer is too large");
  }
  await new Promise((resolve, reject) => {
    let received = 0;
    const hash = crypto.createHash("sha256");
    const output = fs.createWriteStream(destination, { flags: "wx" });
    response.on("data", chunk => {
      received += chunk.length;
      hash.update(chunk);
      if (received > MAX_INSTALLER_BYTES) {
        response.destroy(new Error("Installer is too large"));
      }
    });
    response.on("error", reject);
    output.on("error", reject);
    output.on("finish", () => {
      const actualSha256 = hash.digest("hex");
      if (!hashesMatch(expectedSha256, actualSha256)) {
        reject(new Error("Installer SHA-256 checksum mismatch"));
        return;
      }
      resolve();
    });
    response.pipe(output);
  });
}

const defaultMessages = {
  updateTitle: "Szeptucha — update",
  updateAvailable: "A new version of Szeptucha is available ({version}).",
  updateDownloadQuestion: "Would you like to download and install the update?",
  updateDownload: "Download",
  updateLater: "Later",
  updateDownloaded: "The update has been downloaded.",
  updateInstallDetail: "Save your work. The app will close and start the installer.",
  updateInstallNow: "Install now",\n  updateFailed: "The update could not be downloaded or verified.",
};

function createUpdater({
  app,
  dialog,
  translations = {},
  platform = process.platform,
  logger = console,
}) {
  const messages = { ...defaultMessages, ...translations };
  let checking = false;
  async function checkForUpdates() {
    if (checking || !app.isPackaged || platform !== "win32") return;
    checking = true;
    let installerPath;
    try {
      const release = await latestRelease();
      const version = String(release.tag_name || "").replace(/^v/, "");
      if (compareVersions(version, app.getVersion()) <= 0) return;
      const asset = (release.assets || []).find(item =>
        /^Szeptucha-Setup-\d+\.\d+\.\d+\.exe$/i.test(item.name),
      );
      if (!asset) return;
      const prompt = await dialog.showMessageBox({
        type: "info",
        title: messages.updateTitle,
        message: messages.updateAvailable.replace("{version}", version),
        detail: messages.updateDownloadQuestion,
        buttons: [messages.updateDownload, messages.updateLater],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (prompt.response !== 0) return;
      installerPath = path.join(os.tmpdir(), `Szeptucha-Setup-${version}.exe`);
      const checksumAsset = (release.assets || []).find(item =>
        item.name === "SHA256SUMS.txt",
      );
      if (!checksumAsset) throw new Error("Release checksum manifest is missing");
      const manifest = await downloadChecksumManifest(checksumAsset);
      const expectedSha256 = parseSha256Manifest(manifest, asset.name);
      if (!expectedSha256) {
        throw new Error("Installer checksum is missing from the release manifest");
      }
      await downloadInstaller(asset, installerPath, expectedSha256);
      const ready = await dialog.showMessageBox({
        type: "info",
        title: messages.updateTitle,
        message: messages.updateDownloaded,
        detail: messages.updateInstallDetail,
        buttons: [messages.updateInstallNow, messages.updateLater],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      });
      if (ready.response !== 0) {
        await fs.promises.unlink(installerPath).catch(() => {});
        installerPath = null;
        return;
      }
      const child = spawn(installerPath, [], { detached: true, stdio: "ignore" });
      child.on("error", error => logger.error("Could not start Szeptucha installer", error));
      child.unref();
      app.quit();
    } catch (error) {
      logger.error("Szeptucha update check failed", error);
      if (installerPath) {
        await fs.promises.unlink(installerPath).catch(() => {});
        await dialog.showMessageBox({
          type: "error",
          title: messages.updateTitle,
          message: messages.updateFailed,
          noLink: true,
        }).catch(() => {});
      }
    } finally {
      checking = false;
    }
  }
  return { checkForUpdates };
}

module.exports = { compareVersions, createUpdater, parseSha256Manifest, hashesMatch };
