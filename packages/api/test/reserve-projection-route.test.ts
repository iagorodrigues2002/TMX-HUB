import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerGetReserveProjection } from '../src/routes/tracking-overview/get-reserve-projection.js';

async function setup(authenticated = true) {
  const app = Fastify();
  const db = vi.fn(async () => []);
  const getOrSet = vi.fn(async (_options, load) => load());
  app.decorate('db', db);
  app.decorate('analyticsCache', { getOrSet });
  app.decorate('offerStore', {
    listAccessible: async () => [
      { id: 'own', userId: 'me' },
      { id: 'shared', userId: 'another' },
    ],
  });
  if (authenticated)
    app.addHook('preHandler', async (req) => {
      req.user = { sub: 'me', role: 'user', email: 'test@example.test', iat: 0, exp: 0 };
    });
  registerGetReserveProjection(app);
  return { app, db, getOrSet };
}

describe('reserve projection authorization', () => {
  it('rejects unauthenticated requests without querying or caching', async () => {
    const { app, db, getOrSet } = await setup(false);
    expect((await app.inject('/tracking/reserve-projection')).statusCode).toBe(401);
    expect(db).not.toHaveBeenCalled();
    expect(getOrSet).not.toHaveBeenCalled();
    await app.close();
  });
  it('rejects foreign offers before querying or caching', async () => {
    const { app, db, getOrSet } = await setup();
    expect((await app.inject('/tracking/reserve-projection?offer_ids=foreign')).statusCode).toBe(
      403,
    );
    expect(db).not.toHaveBeenCalled();
    expect(getOrSet).not.toHaveBeenCalled();
    await app.close();
  });
  it('defaults to owned offers, not every accessible account', async () => {
    const { app, db, getOrSet } = await setup();
    expect((await app.inject('/tracking/reserve-projection')).json().offer_count).toBe(1);
    expect(getOrSet.mock.calls[0]?.[0].tags).toEqual(['own']);
    expect(db.mock.calls).toHaveLength(1);
    await app.close();
  });
});
