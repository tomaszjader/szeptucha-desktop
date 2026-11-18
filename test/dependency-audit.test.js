const test = require('node:test');
const assert = require('node:assert/strict');
const { assessAudit } = require('../scripts/audit-dependencies.cjs');
const withdrawn = {
  name: 'picomatch', severity: 'high',
  url: 'https://github.com/advisories/GHSA-fc5q-39xc-vjpf',
};
const now = Date.parse('2026-11-18T16:00:00Z');
const report = vulnerabilities => ({ auditReportVersion: 2, vulnerabilities });

test('withdrawn advisory and its transitive chains do not block the audit', () => {
  const result = assessAudit(report({
    picomatch: { via: [withdrawn] },
    tinyglobby: { via: ['picomatch'] },
    vite: { via: ['tinyglobby', 'picomatch'] },
  }), now);
  assert.deepEqual(result, { blocking: [], ignored: [withdrawn.url] });
});

test('other high and critical advisories still block, including the same package', () => {
  for (const severity of ['high', 'critical']) {
    const active = { name: 'picomatch', severity, url: 'https://github.com/advisories/GHSA-other' };
    const result = assessAudit(report({ picomatch: { via: [withdrawn, active] } }), now);
    assert.deepEqual(result.blocking, [active.url]);
  }
});

test('withdrawn exception is restricted to picomatch and expires', () => {
  assert.deepEqual(assessAudit(report({ other: { via: [{ ...withdrawn, name: 'other' }] } }), now).blocking, [withdrawn.url]);
  assert.deepEqual(assessAudit(report({ picomatch: { via: [withdrawn] } }), Date.parse('2026-12-18T00:00:00Z')).blocking, [withdrawn.url]);
});

test('clean reports and moderate findings pass', () => {
  assert.deepEqual(assessAudit(report({}), now), { blocking: [], ignored: [] });
  assert.deepEqual(assessAudit(report({ tool: { via: [{ name: 'tool', severity: 'moderate', url: 'https://example.test/moderate' }] } }), now).blocking, []);
});

test('audit errors, malformed reports and missing dependency entries fail closed', () => {
  for (const value of [null, {}, { error: {} }, report([]), report({ tool: { via: [] } }),
    report({ tool: { via: ['missing'] } }), report({ tool: { via: [{}] } })]) {
    assert.throws(() => assessAudit(value, now));
  }
});
