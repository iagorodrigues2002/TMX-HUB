import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerGetCountriesRoutes } from '../src/routes/tracking-admin/get-countries.js';
import { registerGetReceiptRevenueRoutes } from '../src/routes/tracking-admin/get-receipt-revenue.js';

const endpoints = ['country-activity', 'funnel-activity', 'receipt-revenue'];
describe.each(endpoints)('overview %s access boundary', (endpoint) => {
  async function fixture(allowed: boolean, available = true) {
    const app = Fastify();
    const db = vi.fn(async () => []);
    const assertAccess = vi.fn(async () => {
      if (!allowed) throw Object.assign(new Error('Forbidden'), { statusCode: 403 });
    });
    app.decorate('db', available ? db : null);
    app.decorate('offerStore', { assertAccess });
    app.addHook('onRequest', async (req) => {
      req.user = { sub: 'member', role: 'member' } as typeof req.user;
    });
    registerGetCountriesRoutes(app);
    registerGetReceiptRevenueRoutes(app);
    return { app, db, assertAccess };
  }
  it('checks offer access before querying any data', async () => {
    const { app, db, assertAccess } = await fixture(false);
    try {
      const response = await app.inject(`/offers/other-offer/tracking/${endpoint}`);
      expect(response.statusCode).toBe(403);
      expect(assertAccess).toHaveBeenCalledWith('other-offer', 'member', false);
      expect(db).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('fails closed when storage is unavailable', async () => {
    const { app, db } = await fixture(true, false);
    try {
      expect((await app.inject(`/offers/offer/tracking/${endpoint}`)).statusCode).toBe(503);
      expect(db).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
  it('rejects a reversed period before SQL', async () => {
    const { app, db } = await fixture(true);
    try {
      const response = await app.inject(
        `/offers/offer/tracking/${endpoint}?from=2026-01-02&to=2026-01-01`,
      );
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
      expect(db).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
