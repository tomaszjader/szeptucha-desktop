const path = require('node:path');
const fs = require('node:fs');
const { createWorker } = require('tesseract.js');

async function makeWorker(cachePath, logger = () => {}) {
  const langPath = path.join(cachePath, 'languages');
  fs.mkdirSync(langPath, { recursive: true });
  for (const language of ['pol', 'eng']) {
    const source = require(`@tesseract.js-data/${language}`).langPath;
    const target = path.join(langPath, `${language}.traineddata.gz`);
    if (!fs.existsSync(target)) fs.copyFileSync(path.join(source, `${language}.traineddata.gz`), target);
  }
  return createWorker('pol+eng', 1, { langPath, cachePath: langPath, gzip: true, logger });
}
module.exports = { makeWorker };
