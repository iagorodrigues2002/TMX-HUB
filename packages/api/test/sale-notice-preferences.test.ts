import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { saleNoticePreferenceRoutes } from '../src/routes/sale-notice-preferences.js';
import { saleNoticeOffers } from '../src/services/sale-notice-preferences.js';

const offers = [
  { id: 'mine', name: 'Mine', userId: 'a' },
  { id: 'other', name: 'Other', userId: 'b' },
];
function fixture() {
  const selected = new Map<string, string[]>();
  const legacy = new Map<string, string>();
  const db = vi.fn(async (sql: TemplateStringsArray, ...values: unknown[]) => {
    if (sql.join('').includes('INSERT INTO sale_notice_preferences'))
      selected.set(values[0] as string, values[1] as string[]);
    if (sql.join('').includes('SELECT offer_ids'))
      return selected.has(values[0] as string)
        ? [{ offer_ids: selected.get(values[0] as string) }]
        : [];
    return [];
  });
  return {
    db,
    selected,
    redis: { get: async (key: string) => legacy.get(key) ?? null },
    legacy,
    offerStore: {
      listAccessible: async (id: string, admin: boolean) =>
        admin ? offers : offers.filter((o) => o.userId === id),
    },
  };
}
async function setup(role?: 'admin' | 'user') {
  const app = Fastify();
  const f = fixture();
  for (const key of ['db', 'redis', 'offerStore'] as const) app.decorate(key, f[key]);
  if (role)
    app.addHook('preHandler', async (req) => {
      req.user = { sub: 'a', role, email: 'a@example.test', iat: 0, exp: 0 };
    });
  await app.register(saleNoticePreferenceRoutes);
  return { app, ...f };
}
it('preserves legacy own-only and keeps selections personal, including none', async () => {
  const app = fixture();
  app.legacy.set('user-sale-notice-scope:a', 'own');
  expect(
    (await saleNoticeOffers(app as never, { sub: 'a', role: 'admin' })).map((o) => o.id),
  ).toEqual(['mine']);
  app.selected.set('a', []);
  expect(await saleNoticeOffers(app as never, { sub: 'a', role: 'admin' })).toEqual([]);
  expect((await saleNoticeOffers(app as never, { sub: 'b', role: 'admin' })).length).toBe(2);
});
it('does not turn stored selections into authorization and honors explicit empty tools', async () => {
  const app = fixture();
  app.selected.set('a', ['mine', 'other']);
  expect(
    (await saleNoticeOffers(app as never, { sub: 'a', role: 'user' })).map((o) => o.id),
  ).toEqual(['mine']);
  expect(await saleNoticeOffers(app as never, { sub: 'a', role: 'user', tools: [] })).toEqual([]);
});
it('requires authentication and returns only authorized offers with no-store', async () => {
  const anonymous = await setup();
  expect((await anonymous.app.inject('/tracking/sale-notice-preferences')).statusCode).toBe(401);
  await anonymous.app.close();
  const { app } = await setup('user');
  const response = await app.inject('/tracking/sale-notice-preferences');
  expect(response.headers['cache-control']).toBe('private, no-store');
  expect(response.json().offers.map((o: { id: string }) => o.id)).toEqual(['mine']);
  await app.close();
});
it('rejects a different user or unauthorized offer, persists empty and selected lists', async () => {
  const { app, selected } = await setup('user');
  const put = (payload: object) =>
    app.inject({ method: 'PUT', url: '/tracking/sale-notice-preferences', payload });
  expect((await put({ offer_ids: ['mine'], userId: 'b' })).statusCode).toBe(400);
  expect((await put({ offer_ids: ['other'] })).statusCode).toBe(403);
  expect(selected.size).toBe(0);
  expect((await put({ offer_ids: [] })).statusCode).toBe(200);
  expect((await app.inject('/tracking/sale-notice-preferences')).json().offer_ids).toEqual([]);
  expect((await put({ offer_ids: ['mine', 'mine'] })).json()).toEqual({ offer_ids: ['mine'] });
  expect(selected.get('a')).toEqual(['mine']);
  expect(selected.has('b')).toBe(false);
  await app.close();
});
