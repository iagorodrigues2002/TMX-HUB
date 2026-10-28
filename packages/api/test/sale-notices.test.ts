import Fastify from 'fastify';
import { expect, it, vi } from 'vitest';
import { registerGetSaleNotices } from '../src/routes/tracking-overview/get-sale-notices.js';

async function fixture(
  offers: { id: string; name: string }[],
  rows: unknown[] = [],
  authenticated = true,
) {
  const app = Fastify();
  const db = vi.fn(async () => rows);
  const listAccessible = vi.fn(async () => offers);
  app.decorate('db', db);
  app.decorate('offerStore', { listAccessible });
  app.addHook('onRequest', async (req) => {
    if (authenticated) req.user = { sub: 'member', role: 'member' } as typeof req.user;
  });
  registerGetSaleNotices(app);
  return { app, db, listAccessible };
}

it('rejects unauthenticated and invalid cursors without querying orders', async () => {
  for (const authenticated of [false, true]) {
    const { app, db } = await fixture([], [], authenticated);
    try {
      expect((await app.inject('/tracking/sale-notices?since=invalid')).statusCode).toBe(
        authenticated ? 400 : 401,
      );
      expect(db).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  }
});

it('empty access cannot query other offers', async () => {
  const { app, db } = await fixture([]);
  try {
    const response = await app.inject(
      `/tracking/sale-notices?since=${new Date(Date.now() - 1000).toISOString()}`,
    );
    expect(response.json()).toEqual({ items: [], next: null, offer_ids: [] });
    expect(db).not.toHaveBeenCalled();
  } finally {
    await app.close();
  }
});

it('uses authorized offers only and keyset pagination without dropping a burst', async () => {
  const date = new Date(Date.now() - 1000).toISOString();
  const rows = Array.from({ length: 201 }, (_, i) => ({
    id: String(i).padStart(4, '0'),
    offer_id: 'allowed',
    occurred_at: date,
    status: 'paid',
  }));
  const { app, db, listAccessible } = await fixture([{ id: 'allowed', name: 'Offer' }], rows);
  try {
    const response = await app.inject(`/tracking/sale-notices?since=${date}`);
    expect(response.statusCode).toBe(200);
    expect(listAccessible).toHaveBeenCalledWith('member', false);
    expect(db.mock.calls[0]?.slice(1)).toContainEqual(['allowed']);
    expect(response.json().items).toHaveLength(200);
    expect(response.json().next).toEqual({ since: date, after_id: '0199' });
    expect(response.json().items[0].offerName).toBe('Offer');
  } finally {
    await app.close();
  }
});
