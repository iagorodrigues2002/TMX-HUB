import { CREATIVE_HISTORY_START } from '@page-cloner/shared/creative-identity';
import { todayIso } from '@page-cloner/shared/date-range';
import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../src/env.js', () => ({ env: { NODE_ENV: 'test', LOG_LEVEL: 'error' } }));
vi.mock('../src/services/intraday-store.js', () => ({
  saoPauloParts: () => ({ date: '2026-11-09' }),
}));
import { registerCreativeDriveRoutes } from '../src/routes/ads-intelligence/creative-drive.js';
import { registerTrafficUserConnection } from '../src/routes/meta-control/traffic-user-connection.js';
import {
  CREATIVE_WORKSPACE_COMPANY,
  companyCreativeSnapshot,
  TRAFFIC_SERVER_OWNER,
  serverTrafficSnapshot,
} from '../src/services/traffic-server-cache.js';
afterEach(() => vi.unstubAllEnvs());

it('serves a covered historical period after midnight without using incomplete or foreign company snapshots', async () => {
  const snapshot = { from: '2026-08-01', to: '2026-11-11', insights: [], failures: [] };
  const storage = new Map<string, string>([
    ['traffic-sync:v1:company:company-a:snapshot:2026-08-01:2026-11-11',
      JSON.stringify({ companyId: 'company-a', snapshot })],
  ]);
  const redis = { get: async (key: string) => storage.get(key) ?? null } as never;
  expect(await companyCreativeSnapshot(redis, 'company-a', '2026-08-01', '2026-11-12', '2026-11-10'))
    .toEqual(snapshot);
  expect(await companyCreativeSnapshot(redis, 'company-a', '2026-08-01', '2026-11-12'))
    .toBeNull();
  expect(await companyCreativeSnapshot(redis, 'company-b', '2026-08-01', '2026-11-12', '2026-11-10'))
    .toBeNull();
  storage.set('traffic-sync:v1:company:company-a:snapshot:2026-08-01:2026-11-11',
    JSON.stringify({ companyId: 'company-a', snapshot: { ...snapshot, failures: ['account'] } }));
  expect(await companyCreativeSnapshot(redis, 'company-a', '2026-08-01', '2026-11-12', '2026-11-10'))
    .toBeNull();
});

it('serves only the existing server owner and never exposes the token or another administrator snapshot', async () => {
  vi.stubEnv('TMX_TRAFFIC_SYNC_ENABLED', '1');
  vi.stubEnv('TMX_TRAFFIC_META_TOKEN', 'server-secret-never-leaves');
  const owner = TRAFFIC_SERVER_OWNER;
  const from = '2026-11-09';
  const to = from;
  const key = `traffic-sync:v1:${owner}:snapshot:${from}:${to}`;
  const data = {
    ownerId: owner,
    from,
    to,
    updatedAt: new Date().toISOString(),
    snapshot: { from, to, hourly: [{ hour: 8 }], accounts: [], campaigns: [] },
    inventory: [
      {
        id: 'act_1',
        name: 'Account',
        account_status: 1,
        business: { id: '343982344905400', name: 'BM01' },
      },
    ],
  };
  const storage = new Map([[key, JSON.stringify(data)]]);
  const redis = { get: vi.fn(async (k: string) => storage.get(k) ?? null) };
  const app = Fastify();
  app.decorate('redis', redis);
  app.addHook('preHandler', async (req) => {
    const sub = req.headers['x-user'];
    if (typeof sub === 'string') req.user = { sub, role: 'admin' };
  });
  registerTrafficUserConnection(app);
  const response = await app.inject({
    url: `/meta-control/traffic/connection/report?from=${from}&to=${to}&hourly=0`,
    headers: { 'x-user': owner },
  });
  expect(response.statusCode).toBe(200);
  expect(response.json()).not.toHaveProperty('hourly');
  expect(storage.get(key)).toContain('hourly');
  expect(response.body).not.toContain('server-secret');
  const inventory = await app.inject({
    url: '/meta-control/traffic/connection/inventory',
    headers: { 'x-user': owner },
  });
  expect(inventory.statusCode).toBe(200);
  expect(inventory.json().businesses[0].relationship).toBe('managed');
  const other = await app.inject({
    url: `/meta-control/traffic/connection/report?from=${from}&to=${to}`,
    headers: { 'x-user': 'another-admin' },
  });
  expect(other.statusCode).toBe(404);
  expect(other.body).not.toContain('act_1');
  await app.close();
});

it('fails closed on a mismatched cached owner or date', async () => {
  vi.stubEnv('TMX_TRAFFIC_SYNC_ENABLED', '1');
  const redis = {
    get: async () => JSON.stringify({ ownerId: 'other', from: '2026-11-09', to: '2026-11-09' }),
  };
  await expect(
    serverTrafficSnapshot(redis as never, TRAFFIC_SERVER_OWNER, '2026-11-09', '2026-11-09'),
  ).rejects.toThrow('scope');
});

it('serves the company creative workspace to its active admins, isolated from other traffic', async () => {
  vi.stubEnv('TMX_TRAFFIC_SYNC_ENABLED', '1');
  const company = 'qa-company';
  const from = CREATIVE_HISTORY_START;
  const to = todayIso();
  const params = `from=${from}&to=${to}`;
  const reportPath = '/meta-control/traffic/connection/report';
  const drivePath = '/ads-intelligence/creative-drive';
  const rootUrl = 'https://drive.google.com/drive/folders/fixture-folder';
  const stored = new Map([
    [CREATIVE_WORKSPACE_COMPANY, company],
    [
      `traffic-sync:v1:company:${company}:snapshot:${from}:${to}`,
      JSON.stringify({
        companyId: company,
        snapshot: {
          from,
          to,
          hourly: [{ hour: 8 }],
          insights: [
            { date: from, adId: 'first', spend: 5 },
            { date: to, adId: 'last', spend: 12 },
          ],
        },
      }),
    ],
    [`creative-drive:v1:company:${company}:config`, JSON.stringify({ rootUrl, requestedAt: 1 })],
  ]);
  const app = Fastify();
  app.decorate('redis', {
    get: async (key: string) => stored.get(key) ?? null,
    mget: async (...keys: string[]) => keys.map((key) => stored.get(key) ?? null),
  });
  app.decorate('db', (_parts: TemplateStringsArray, companyId: string, user: string) =>
    companyId === company && ['reader', 'owner', 'member'].includes(user)
      ? [{ company_id: company, role: user === 'member' ? 'member' : 'admin', status: 'active', tools: [] }]
      : [],
  );
  app.addHook('preHandler', async (req) => {
    const sub = String(req.headers['x-user']);
    req.user = { sub, role: sub === 'member' ? 'user' : 'admin' };
  });
  registerTrafficUserConnection(app);
  registerCreativeDriveRoutes(app);
  const reader = { 'x-user': 'reader' };
  try {
    const report = await app.inject({
      url: `${reportPath}?${params}&workspace=creative`,
      headers: reader,
    });
    expect(report.statusCode).toBe(200);
    expect(report.json()).not.toHaveProperty('hourly');
    const filtered = await app.inject({
      url: `${reportPath}?from=${to}&to=${to}&workspace=creative`,
      headers: reader,
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json()).toMatchObject({
      from: to,
      to,
      insights: [{ date: to, adId: 'last', spend: 12 }],
    });
    expect(report.json().insights).toHaveLength(2);
    for (const dates of [
      'from=2026-07-31&to=2026-08-01',
      'from=2099-01-01&to=2099-01-01',
      'from=invalid&to=invalid',
    ]) {
      expect(
        (await app.inject({ url: `${reportPath}?${dates}&workspace=creative`, headers: reader }))
          .statusCode,
      ).toBe(400);
    }
    expect((await app.inject({ url: `${reportPath}?${params}`, headers: reader })).statusCode).toBe(
      200,
    );
    for (const user of ['another-admin', 'member']) {
      expect(
        (
          await app.inject({
            url: `${reportPath}?${params}&workspace=creative`,
            headers: { 'x-user': user },
          })
        ).statusCode,
      ).toBe(404);
    }
    for (const user of ['reader', 'owner'])
      expect(
        (await app.inject({ url: drivePath, headers: { 'x-user': user } })).json().rootUrl,
      ).toBe(rootUrl);
    expect(
      (
        await app.inject({
          url: drivePath,
          headers: { 'x-user': 'another-admin' },
        })
      ).json().rootUrl,
    ).toBe('');
    expect(
      (
        await app.inject({
          url: drivePath,
          headers: { 'x-user': 'member' },
        })
      ).statusCode,
    ).toBe(403);
  } finally {
    await app.close();
  }
});
