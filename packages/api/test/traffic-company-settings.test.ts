import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
vi.mock('../src/env.js', () => ({ env: { NODE_ENV: 'test' } }));
import { registerTrafficCompanySettings } from '../src/services/traffic-company-settings.js';
import { companyTrafficInventory } from '../src/services/traffic-server-cache.js';

it('reads inventory from company storage without depending on a personal report or login', async () => {
  const data = new Map([
    ['traffic-daily:v1:company-a:inventory', JSON.stringify([{ id: 'act_123', name: 'Company account', account_status: 1, business: { id: '456', name: 'BM' } }])],
    ['traffic-daily:v1:company-a:fetched-at', '2026-11-12T12:00:00Z'],
    ['traffic-company:v1:company-a:inventory', JSON.stringify({ businesses: [{ id: '456', relationship: 'managed' }] })],
  ]);
  const redis = { get: async (key: string) => data.get(key) ?? null } as Parameters<typeof companyTrafficInventory>[0];
  const result = await companyTrafficInventory(redis, 'company-a');
  expect(result.accounts[0].id).toBe('act_123');
  expect(result.businesses[0].relationship).toBe('managed');
  expect(result.fetchedAt).toBe('2026-11-12T12:00:00Z');
  expect(await companyTrafficInventory(redis, 'company-b')).toBeNull();
});

it('shares company settings between admins, denies outsiders and rejects stale writes without losing data', async () => {
  const app = Fastify();
  const company = '00000000-0000-4000-8000-000000000001';
  const values = new Map<string, string>([['creative-drive:v1:company-id', company]]);
  app.decorate('redis', {
    get: async (key: string) => values.get(key) ?? null,
    eval: async (_script: string, _count: number, key: string, revision: string, value: string) => {
      if ((JSON.parse(values.get(key) ?? '{}').revision ?? '') !== revision) return 0;
      values.set(key, value); return 1;
    },
  });
  app.decorate('db', async (_sql: TemplateStringsArray, _company: string, user: string) =>
    ['alice', 'lucas'].includes(user) ? [{ company_id: company, role: 'admin', status: 'active', tools: [] }] : []);
  app.addHook('preHandler', async (req) => { req.user = { sub: String(req.headers['x-user']), role: 'admin' }; });
  registerTrafficCompanySettings(app);
  const url = '/meta-control/traffic/settings/classification';
  const value = { campaigns: { '123': 'offer-a' }, links: {} };
  const write = await app.inject({ method: 'PUT', url, headers: { 'x-user': 'alice' }, payload: { revision: '', value } });
  expect(write.statusCode).toBe(200);
  expect((await app.inject({ url, headers: { 'x-user': 'lucas' } })).json()).toEqual(write.json());
  expect((await app.inject({ url, headers: { 'x-user': 'outsider' } })).statusCode).toBe(403);
  const stale = await app.inject({ method: 'PUT', url, headers: { 'x-user': 'lucas' }, payload: { revision: '', value: { campaigns: {}, links: {} } } });
  expect(stale.statusCode).toBe(409);
  expect((await app.inject({ url, headers: { 'x-user': 'alice' } })).json().value).toEqual(value);
  await app.close();
});
