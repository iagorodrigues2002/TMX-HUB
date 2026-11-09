import type { FastifyInstance } from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { encryptSecret } from '../src/lib/secret-box.js';
vi.mock('../src/env.js', () => ({ env: { NODE_ENV: 'production', LOG_LEVEL: 'error' } }));
vi.mock('../src/services/intraday-store.js', () => ({
  saoPauloParts: () => ({ date: '2026-11-09' }),
}));
vi.mock('../src/services/meta-traffic-reader.js', () => ({
  validTrafficRange: (a: string, b: string) => /^\d{4}-\d{2}-\d{2}$/.test(a) && a <= b,
  readMetaTraffic: vi.fn(async (token: string, from: string, to: string) => ({
    inventory: [
      {
        id: token === 'alice-token' ? 'act_1' : 'act_2',
        name: 'Account',
        account_status: 1,
        business: { id: '100', name: 'Operation' },
      },
    ],
    snapshot: {
      from,
      to,
      fetchedAt: new Date().toISOString(),
      purchaseClassification: 'front_only_user_confirmed',
      accounts: [token === 'alice-token' ? 'alice-account' : 'bob-account'],
    },
  })),
}));
vi.mock('../src/services/meta-traffic-alerts.js', () => ({
  trafficAlertPrefix: (id: string) => `health:${id}:`,
  readMetaTrafficHealth: vi.fn(async () => ({
    observedAt: new Date().toISOString(),
    accounts: [],
  })),
  recordTrafficHealth: vi.fn(),
}));
import { readMetaTraffic } from '../src/services/meta-traffic-reader.js';
import {
  createPersonalTrafficSync,
  trafficUserKey,
} from '../src/services/traffic-personal-sync.js';
afterEach(() => vi.clearAllMocks());

function fixture() {
  const storage = new Map<string, string>();
  const hooks = new Map<string, () => Promise<void>>();
  const secret = 'synthetic-traffic-encryption-secret-32';
  for (const id of ['alice', 'bob'])
    storage.set(
      `${trafficUserKey(id)}connection`,
      JSON.stringify({
        revision: id,
        frontOnly: id === 'alice',
        encrypted: encryptSecret(`${id}-token`, secret),
      }),
    );
  const redis = {
    get: vi.fn(async (k: string) => storage.get(k) ?? null),
    set: vi.fn(async (k: string, v: string, ...args: unknown[]) => {
      if (args.includes('NX') && storage.has(k)) return null;
      storage.set(k, v);
      return 'OK';
    }),
    smembers: async () => ['alice', 'bob'],
    hget: async (k: string) => k.slice(5),
    eval: vi.fn(async (script: string, n: number, ...args: unknown[]) => {
      const keys = args.slice(0, n) as string[];
      const values = args.slice(n) as string[];
      if (storage.get(keys[0]!) !== values[0]) return 0;
      if (script.includes("redis.call('SET'")) {
        if (storage.get(keys[1]!) !== values[1]) return 0;
        storage.set(keys[2]!, values[2]!);
        storage.delete(keys[3]!);
        if (keys[4] && values[3]) storage.set(keys[4], values[3]);
        return 1;
      }
      if (script.includes("redis.call('DEL'")) storage.delete(keys[0]!);
      return 1;
    }),
  };
  const app = {
    redis,
    addHook: (name: string, fn: () => Promise<void>) => hooks.set(name, fn),
  } as unknown as FastifyInstance;
  const sync = createPersonalTrafficSync(app, async () => secret);
  return { storage, redis, hooks, sync };
}

it('resumes persisted requested periods at startup and isolates each user and front confirmation', async () => {
  const f = fixture();
  f.storage.set(
    `${trafficUserKey('alice')}inventory`,
    JSON.stringify({ businesses: [{ id: '100', relationship: 'managed' }] }),
  );
  f.storage.set(
    `${trafficUserKey('alice')}requested`,
    JSON.stringify({ from: '2026-11-01', to: '2026-11-09' }),
  );
  await f.hooks.get('onReady')!();
  await vi.waitFor(() =>
    expect(f.storage.has(`${trafficUserKey('alice')}alice:2026-11-01:2026-11-09`)).toBe(true),
  );
  await vi.waitFor(() =>
    expect(f.storage.has(`${trafficUserKey('bob')}bob:2026-11-09:2026-11-09`)).toBe(true),
  );
  const alice = JSON.parse(f.storage.get(`${trafficUserKey('alice')}alice:2026-11-01:2026-11-09`)!);
  const bob = JSON.parse(f.storage.get(`${trafficUserKey('bob')}bob:2026-11-09:2026-11-09`)!);
  expect(alice.accounts).toEqual(['alice-account']);
  expect(bob.accounts).toEqual(['bob-account']);
  expect(alice.purchaseClassification).toBe('front_only_user_confirmed');
  expect(bob).not.toHaveProperty('purchaseClassification');
  const imported = JSON.parse(f.storage.get(`${trafficUserKey('alice')}inventory`)!);
  expect(imported.accounts[0].id).toBe('act_1');
  expect(imported.businesses[0].relationship).toBe('managed');
  expect(JSON.stringify(alice)).not.toContain('alice-token');
  await f.hooks.get('onClose')!();
});

it('does not publish an old connection after the token is replaced', async () => {
  const f = fixture();
  vi.mocked(readMetaTraffic).mockImplementationOnce(async () => {
    f.storage.set(`${trafficUserKey('alice')}connection`, 'replaced');
    return { snapshot: { from: '2026-11-01', to: '2026-11-09' } } as never;
  });
  await f.sync.request('alice', '2026-11-01', '2026-11-09');
  await vi.waitFor(() => expect(f.sync.busy.size).toBe(0));
  expect(f.storage.has(`${trafficUserKey('alice')}alice:2026-11-01:2026-11-09`)).toBe(false);
  await f.hooks.get('onClose')!();
});

it('absorbs a Redis outage while recording a provider failure', async () => {
  const f = fixture();
  vi.mocked(readMetaTraffic).mockImplementationOnce(async () => {
    f.redis.get.mockRejectedValue(Error('Redis offline'));
    throw Error('provider failed with private token');
  });
  await f.sync.request('alice', '2026-11-01', '2026-11-09');
  await vi.waitFor(() => expect(f.sync.busy.size).toBe(0));
  expect(f.storage.has(`${trafficUserKey('alice')}error`)).toBe(false);
  await f.hooks.get('onClose')!();
});

it('releases an in-flight lease on shutdown without publishing its late response', async () => {
  const f = fixture();
  let finish!: () => void;
  vi.mocked(readMetaTraffic).mockImplementationOnce(async () => {
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
    return { snapshot: { from: '2026-11-01', to: '2026-11-09' } } as never;
  });
  await f.sync.request('alice', '2026-11-01', '2026-11-09');
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
  expect(f.storage.has(`${trafficUserKey('alice')}lock`)).toBe(true);
  await f.hooks.get('onClose')!();
  expect(f.storage.has(`${trafficUserKey('alice')}lock`)).toBe(false);
  finish();
  await vi.waitFor(() => expect(f.sync.busy.size).toBe(0));
  expect(f.storage.has(`${trafficUserKey('alice')}alice:2026-11-01:2026-11-09`)).toBe(false);
});
