import Fastify from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('node:fs/promises', () => ({ readFile: vi.fn() }));
vi.mock('../src/env.js', () => ({ env: { NODE_ENV: 'test' } }));
import { readFile } from 'node:fs/promises';
import { env } from '../src/env.js';
import { registerLocalTrafficFinanceRoutes } from '../src/routes/meta-control/get-local-traffic-finance.js';

const owner = '01KQSEXEWXZ9Y67V2HFK18JHJB';
const offer = {
  offer_id: 'offer',
  offer_name: 'PJR_ENG',
  owner_id: owner,
  fees_missing_operations: 0,
  gross_revenue_brl_minor: '15000',
  gross_revenue_usd_minor: '3000',
  net_available_brl_minor: '10000',
  net_available_usd_minor: '2000',
};
const data = {
  source: 'https://theminex.com',
  ownerId: owner,
  ownerName: 'Iago Rodrigues',
  from: '2026-11-07',
  to: '2026-11-07',
  fetchedAt: '2026-11-08T17:00:00.000Z',
  natural: { offers: [offer] },
  general: { offers: [offer] },
  token: 'must-not-leak',
};
const config = { port: 12345, key: 'a'.repeat(64), viewerUserId: 'admin' };
const path = '/meta-control/traffic/finance?from=2026-11-07&to=2026-11-07';
async function app(role = 'admin', sub = 'admin') {
  const server = Fastify();
  server.addHook('preHandler', async (req) => {
    req.user = { role, sub } as typeof req.user;
  });
  registerLocalTrafficFinanceRoutes(server);
  await server.ready();
  return server;
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  env.NODE_ENV = 'test';
});
describe('local real financial bridge', () => {
  it('reports only a live automatic service and strips fields outside the status contract', async () => {
    const state = {
      pid: process.pid,
      automatic: true,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      busy: false,
      todayIntervalMs: 600000,
      yesterdayIntervalMs: 3600000,
      credentialStore: 'macos-keychain',
      periods: {},
      error: '',
      token: 'must-not-leak',
    };
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(state));
    const server = await app();
    const active = await server.inject('/meta-control/traffic/service');
    expect(active.json().running).toBe(true);
    expect(active.body).not.toContain('must-not-leak');
    vi.mocked(readFile).mockResolvedValue(
      JSON.stringify({ ...state, updatedAt: '2026-01-01T00:00:00.000Z' }),
    );
    expect((await server.inject('/meta-control/traffic/service')).json().running).toBe(false);
    vi.mocked(readFile).mockRejectedValue(Error('private path'));
    const missing = await server.inject('/meta-control/traffic/service');
    expect(missing.json()).toEqual({ running: false, automatic: false });
    await server.close();
  });
  it('restricts production, role and pinned local viewer before reading financial data', async () => {
    const member = await app('user');
    expect((await member.inject(path)).statusCode).toBe(403);
    await member.close();
    env.NODE_ENV = 'production';
    const prod = await app();
    expect((await prod.inject(path)).statusCode).toBe(404);
    await prod.close();
    env.NODE_ENV = 'test';
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(config));
    const other = await app('admin', 'other');
    expect((await other.inject(path)).statusCode).toBe(403);
    await other.close();
  });
  it('uses only localhost, validates owner, strips secrets and prevents shared caching', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(config));
    const fetcher = vi.fn(async () => new Response(JSON.stringify(data)));
    vi.stubGlobal('fetch', fetcher);
    const server = await app();
    const response = await server.inject(path);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('private, no-store');
    expect(response.body).not.toContain('must-not-leak');
    expect(response.json().natural.offers[0].net_available_brl_minor).toBe('10000');
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'http://127.0.0.1:12345/finance?from=2026-11-07&to=2026-11-07',
    );
    await server.close();
  });
  it('fails closed for mismatched dates, foreign owner, invalid money or missing bridge', async () => {
    vi.mocked(readFile).mockResolvedValue(JSON.stringify(config));
    const server = await app();
    for (const invalid of [
      { ...data, from: '2026-11-06' },
      { ...data, natural: { offers: [{ ...offer, owner_id: 'another' }] } },
      { ...data, general: { offers: [{ ...offer, net_available_brl_minor: 'NaN' }] } },
    ]) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify(invalid))),
      );
      expect((await server.inject(path)).statusCode).toBe(503);
    }
    vi.mocked(readFile).mockRejectedValue(Error('secret file path'));
    const response = await server.inject(path);
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain('secret file path');
    expect(
      (await server.inject('/meta-control/traffic/finance?from=2026-02-30&to=2026-11-07'))
        .statusCode,
    ).toBe(400);
    await server.close();
  });
});
