const { spawnSync } = require('node:child_process');

// Withdrawn by GitHub on 2026-11-18; npm's advisory mirror still reports it.
// https://github.com/advisories/GHSA-fc5q-39xc-vjpf
const WITHDRAWN_URL = 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf';
const EXCEPTION_EXPIRES = Date.parse('2026-12-18T00:00:00Z');

function assessAudit(report, now = Date.now()) {
  if (report?.error || report?.auditReportVersion !== 2
      || !report.vulnerabilities || typeof report.vulnerabilities !== 'object'
      || Array.isArray(report.vulnerabilities)) {
    throw new Error('Invalid or failed npm audit report');
  }
  const blocking = new Set();
  const ignored = new Set();
  const visited = new Set();
  function visit(name) {
    if (visited.has(name)) return;
    const item = report.vulnerabilities[name];
    if (!item || !Array.isArray(item.via) || item.via.length === 0) {
      throw new Error(`Incomplete npm audit entry: ${name}`);
    }
    visited.add(name);
    for (const advisory of item.via) {
      if (typeof advisory === 'string') {
        visit(advisory);
        continue;
      }
      if (!advisory || typeof advisory.url !== 'string'
          || !['info', 'low', 'moderate', 'high', 'critical'].includes(advisory.severity)) {
        throw new Error(`Invalid npm audit advisory: ${name}`);
      }
      if (advisory.url === WITHDRAWN_URL && advisory.name === 'picomatch'
          && now < EXCEPTION_EXPIRES) {
        ignored.add(advisory.url);
      } else if (['high', 'critical'].includes(advisory.severity)) {
        blocking.add(advisory.url);
      }
    }
  }
  for (const name of Object.keys(report.vulnerabilities)) visit(name);
  return { blocking: [...blocking], ignored: [...ignored] };
}

function main() {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', [
    'audit', '--package-lock-only', '--include=dev', '--include=optional',
    '--audit-level=high', '--json',
  ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024, shell: process.platform === 'win32' });
  if (result.stderr) process.stderr.write(result.stderr);
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.error || ![0, 1].includes(result.status)) {
    throw result.error || new Error(`npm audit failed: ${result.status ?? result.signal}`);
  }
  const assessment = assessAudit(JSON.parse(result.stdout));
  for (const url of assessment.ignored) {
    console.log(`Withdrawn advisory excluded until 2026-12-18: ${url}`);
  }
  if (assessment.blocking.length) {
    console.error('Blocking high/critical advisories:', assessment.blocking.join(', '));
    process.exitCode = 1;
  } else {
    console.log('No active high or critical advisories found.');
  }
}

if (require.main === module) {
  try { main(); }
  catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
module.exports = { assessAudit };
