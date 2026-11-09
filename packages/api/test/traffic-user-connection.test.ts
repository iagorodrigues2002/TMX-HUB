import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/env.js', () => ({
  env: { TRACKING_ENCRYPTION_KEY: 'test-encryption', META_GRAPH_API_VERSION: 'v25.0' },
}));
vi.mock('../src/services/meta-inventory.js', () => ({
  readMetaInventory: vi.fn(async () => ({
    businesses: [
      { id: '1', name: 'BM', status: null },
      { id: '2', name: 'External', status: null },
    ],
    accounts: [{ id: 'act_3', name: 'Account', businessId: '1', status: 'Ativo' }],
    coverage: 'businesses_from_assigned_accounts',
    fetchedAt: new Date().toISOString(),
  })),
}));
vi.mock('../src/services/meta-traffic-reader.js', () => ({
  readMetaTraffic: vi.fn(),
  validTrafficRange: () => true,
}));
import {
  registerTrafficUserConnection,
  trafficUserKey,
} from '../src/routes/meta-control/traffic-user-connection.js';
import { readMetaInventory } from '../src/services/meta-inventory.js';

describe('personal System User connection', () => {
  it('encrypts tokens, isolates users and does not imply BM administration from account ownership', async () => {
    const app = Fastify();
    const storage = new Map<string, string>();
    app.decorate('redis', {
      get: async (key: string) => storage.get(key) ?? null,
      multi: () => {
        const writes: [string, string][] = [];
        const tx = {
          set: (k: string, v: string) => {
            writes.push([k, v]);
            return tx;
          },
          sadd: () => tx,
          del: () => tx,
          exec: async () => {
            for (const [k, v] of writes) storage.set(k, v);
          },
        };
        return tx;
      },
    });
    app.addHook('preHandler', async (req) => {
      const sub = req.headers['x-user'];
      if (typeof sub === 'string') req.user = { sub, role: 'member' } as typeof req.user;
    });
    registerTrafficUserConnection(app);
    const token = 'private-system-user-token-123456';
    expect((await app.inject('/meta-control/traffic/connection')).statusCode).toBe(401);
    const response = await app.inject({
      method: 'POST',
      url: '/meta-control/traffic/connection',
      headers: { 'x-user': 'alice' },
      payload: { name: 'Alice', token, businessId: '1' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(token);
    expect(storage.get(`${trafficUserKey('alice')}connection`)).not.toContain(token);
    expect(
      (
        await app.inject({ url: '/meta-control/traffic/connection', headers: { 'x-user': 'bob' } })
      ).json(),
    ).toEqual({ connected: false, busy: false });
    expect(
      (
        await app.inject({
          url: '/meta-control/traffic/connection/inventory',
          headers: { 'x-user': 'bob' },
        })
      ).statusCode,
    ).toBe(404);
    const inventory = (
      await app.inject({
        url: '/meta-control/traffic/connection/inventory',
        headers: { 'x-user': 'alice' },
      })
    ).json();
    expect(inventory.businesses.map((b: { relationship: string }) => b.relationship)).toEqual([
      'managed',
      'unknown',
    ]);
    const previous = storage.get(`${trafficUserKey('alice')}connection`);
    vi.mocked(readMetaInventory).mockRejectedValueOnce(Error(token));
    const failed = await app.inject({
      method: 'POST',
      url: '/meta-control/traffic/connection',
      headers: { 'x-user': 'alice' },
      payload: { name: 'Replacement', token },
    });
    expect(failed.statusCode).toBe(422);
    expect(failed.body).not.toContain(token);
    expect(storage.get(`${trafficUserKey('alice')}connection`)).toBe(previous);
    await app.close();
  });
});
