import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { localNetworkPolicy, localPreviewEnvironment } from './complete-local-preview.mjs';

// Exact loopback target: this check must never exercise production.
const base = 'http://127.0.0.1:4110';
const login = await fetch(`${base}/v1/auth/login`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Origin: 'http://localhost:3120' },
  body: JSON.stringify({ email: 'admin@native.tmx.test', password: 'Synthetic-preview-2026!' }),
});
assert.equal(login.status, 200);
const { token } = await login.json();
assert.ok(token);
const checks = [
  ['/v1/activity', (data) => Array.isArray(data.entries)],
  ['/v1/ads-intelligence', (data) => data.connection?.dashboard_id === 'synthetic-ads-preview'],
  [
    '/v1/tracking/refunds-dashboard?from=2026-10-01&to=2026-11-02',
    (data) => data.totals.gross_brl_minor === 124800 && data.totals.count === 4,
  ],
  [
    '/v1/tracking/syzepay/companies',
    (data) => data.companies.some((company) => company.name === 'TMX'),
  ],
  [
    '/v1/tracking/syzepay/connections',
    (data) => data.connections.some((connection) => connection.id === 'synthetic-syzepay-tmx'),
  ],
  [
    '/v1/calls',
    (data) => data.calls.some((call) => call.title === 'QA — Call de Spy (demonstração local)'),
  ],
];
for (const [path, validate] of checks) {
  const response = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200, path);
  assert.ok(validate(await response.json()), path);
  console.log(`PASS ${path}`);
}
const unknown = await fetch(`${base}/v1/unknown-local-regression-route`, {
  headers: { Authorization: `Bearer ${token}` },
});
assert.equal(unknown.status, 404, 'Unknown routes must not return fake success');
if (process.platform === 'darwin') {
  const probe = spawnSync(
    '/usr/bin/sandbox-exec',
    [
      '-p',
      localNetworkPolicy,
      process.execPath,
      '--input-type=module',
      '-e',
      `try { await fetch('https://example.com', {signal: AbortSignal.timeout(3000)}); process.exit(1); } catch { process.exit(0); }`,
    ],
    { env: localPreviewEnvironment, timeout: 5000 },
  );
  assert.equal(probe.status, 0, 'External network must remain blocked');
}
console.log('PASS unknown-route contract and outbound isolation');
