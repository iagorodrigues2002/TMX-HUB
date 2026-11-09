import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../src/env.js', () => ({ env: { NODE_ENV: 'test', LOG_LEVEL: 'error' } }));
vi.mock('../src/services/intraday-store.js', () => ({
  saoPauloParts: () => ({ date: '2026-11-09' }),
}));
import { registerTrafficUserConnection } from '../src/routes/meta-control/traffic-user-connection.js';
import {
  TRAFFIC_SERVER_OWNER,
  serverTrafficSnapshot,
} from '../src/services/traffic-server-cache.js';
afterEach(() => vi.unstubAllEnvs());

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
