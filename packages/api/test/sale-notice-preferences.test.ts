import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { saleNoticePreferenceRoutes } from '../src/routes/sale-notice-preferences.js';
import { saleNoticeOffers } from '../src/services/sale-notice-preferences.js';

const offers = [
  { id: 'mine', userId: 'a' },
  { id: 'other', userId: 'b' },
];
function fixture() {
  const saved = new Map<string, string>();
  return {
    redis: {
      get: async (key: string) => saved.get(key) ?? null,
      set: vi.fn(async (key: string, value: string) => {
        saved.set(key, value);
      }),
    },
    offerStore: {
      listAccessible: async (id: string, admin: boolean) =>
        admin ? offers : offers.filter((o) => o.userId === id),
    },
  };
}
it('keeps admin notification scopes personal and does not change member access', async () => {
  const app = fixture();
  app.redis.set('user-sale-notice-scope:a', 'own');
  expect(
    (await saleNoticeOffers(app as never, { sub: 'a', role: 'admin' })).map((o) => o.id),
  ).toEqual(['mine']);
  expect(
    (await saleNoticeOffers(app as never, { sub: 'b', role: 'admin' })).map((o) => o.id),
  ).toEqual(['mine', 'other']);
  expect(
    (await saleNoticeOffers(app as never, { sub: 'a', role: 'user' })).map((o) => o.id),
  ).toEqual(['mine']);
});

async function setup(role?: 'admin' | 'user') {
  const app = Fastify();
  const f = fixture();
  app.decorate('redis', f.redis);
  if (role)
    app.addHook('preHandler', async (req) => {
      req.user = { sub: 'a', role, email: 'fixture@example.test', iat: 0, exp: 0 };
    });
  await app.register(saleNoticePreferenceRoutes);
  return { app, ...f };
}
it('requires admin authentication for reading and changing the personal setting', async () => {
  for (const role of [undefined, 'user'] as const) {
    const { app, redis } = await setup(role);
    for (const method of ['GET', 'PUT'] as const) {
      expect(
        (
          await app.inject({
            method,
            url: '/tracking/sale-notice-preferences',
            ...(method === 'PUT' ? { payload: { scope: 'own' } } : {}),
          })
        ).statusCode,
      ).toBe(role ? 403 : 401);
    }
    expect(redis.set).not.toHaveBeenCalled();
    await app.close();
  }
});
it('persists only the authenticated admin preference and rejects another user target', async () => {
  const { app, redis } = await setup('admin');
  expect((await app.inject('/tracking/sale-notice-preferences')).json()).toEqual({ scope: 'all' });
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: '/tracking/sale-notice-preferences',
        payload: { scope: 'own', userId: 'b' },
      })
    ).statusCode,
  ).toBe(400);
  expect(redis.set).not.toHaveBeenCalled();
  expect(
    (
      await app.inject({
        method: 'PUT',
        url: '/tracking/sale-notice-preferences',
        payload: { scope: 'own' },
      })
    ).statusCode,
  ).toBe(200);
  expect((await app.inject('/tracking/sale-notice-preferences')).json()).toEqual({ scope: 'own' });
  expect(redis.set).toHaveBeenCalledWith('user-sale-notice-scope:a', 'own');
  await app.close();
});
