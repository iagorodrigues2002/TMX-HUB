import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { GoogleAdsDestinationSchema, previewGooglePurchase, type GooglePurchase } from '../src/integrations/google-ads/contracts.js';
import routes from '../src/routes/google-ads-admin.js';

const purchase: GooglePurchase = {
  projectId: 'offer-project', orderId: 'internal-order-id', status: 'paid', orderKind: 'front',
  paidAt: '2026-09-19T10:00:00-03:00', value: 47, currency: 'USD',
  adIdentifiers: { gclid: 'actual-click' },
};

describe('Google Ads isolated foundation', () => {
  it('rejects attempts to enable delivery or inject credentials into drafts', () => {
    expect(GoogleAdsDestinationSchema.safeParse({ name: 'A', customer_id: '1234567890', conversion_action_id: '123', enabled: true }).success).toBe(false);
  });
  it('keeps one transaction identity and original value for independent destinations', () => {
    const a = previewGooglePurchase(purchase, '123-456-7890', '1');
    const b = previewGooglePurchase(purchase, '9876543210', '2');
    expect(a.events).toEqual(b.events);
    expect(a.destinations).not.toEqual(b.destinations);
    expect(a.events[0]).toMatchObject({ eventTimestamp: '2026-09-19T13:00:00.000Z', conversionValue: 47, currency: 'USD' });
    expect(a.validateOnly).toBe(true);
  });
  it('does not send upsells, refused orders, zero values or unmatchable purchases', () => {
    for (const patch of [{ orderKind: 'upsell_1' }, { status: 'refused' }, { value: null }, { value: 0 }, { adIdentifiers: {} }, { paidAt: '2026-09-19T10:00:00' }]) {
      expect(() => previewGooglePurchase({ ...purchase, ...patch }, '1234567890', '1')).toThrow();
    }
  });
  it('supports braid-only capture without manufacturing a gclid', () => {
    expect(previewGooglePurchase({ ...purchase, adIdentifiers: { wbraid: 'original-braid' } }, '1234567890', '1').events[0]?.adIdentifiers)
      .toEqual({ wbraid: 'original-braid' });
  });
  it('does not collide when separate offers have the same external order identity', () => {
    const a = previewGooglePurchase(purchase, '1234567890', '1');
    const b = previewGooglePurchase({ ...purchase, projectId: 'other-project' }, '1234567890', '1');
    expect(a.events[0]?.transactionId).not.toBe(b.events[0]?.transactionId);
  });
  it('checks offer authorization before touching the database', async () => {
    const app = Fastify();
    app.decorate('offerStore', { assertAccess: async () => { throw Object.assign(new Error('forbidden'), { statusCode: 403 }); }, assertManager: async () => { throw Object.assign(new Error('forbidden'), { statusCode: 403 }); } });
    app.addHook('preHandler', async (req) => { (req as any).user = { sub: 'other-user', role: 'user' }; });
    await app.register(routes);
    try {
      for (const method of ['GET', 'POST', 'PUT', 'DELETE'] as const) {
        const response = await app.inject({ method, url: `/offers/private/tracking/google-ads/destinations${method === 'DELETE' || method === 'PUT' ? '/destination' : ''}` });
        expect(response.statusCode).toBe(403);
      }
    } finally { await app.close(); }
  });
  it('reports duplicate edits as a conflict and scopes updates to the requested offer', async () => {
    const app = Fastify();
    const db = vi.fn().mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }));
    app.decorate('db', db);
    app.decorate('offerStore', { assertManager: vi.fn().mockResolvedValue(undefined) });
    app.addHook('preHandler', async (req) => { (req as any).user = { sub: 'manager', role: 'user' }; });
    await app.register(routes);
    try {
      const response = await app.inject({ method: 'PUT', url: '/offers/offer-a/tracking/google-ads/destinations/dest-a',
        payload: { name: 'A', customer_id: '123-456-7890', conversion_action_id: '123' } });
      expect(response.statusCode).toBe(409);
      expect(response.json().error).toBe('google_ads_destination_exists');
      expect(db.mock.calls[0]?.slice(1)).toEqual(['A', '1234567890', '123', 'offer-a', 'dest-a']);
    } finally { await app.close(); }
  });
  it('validates draft input before database writes and never accepts activation', async () => {
    const app = Fastify();
    const db = vi.fn();
    app.decorate('db', db);
    app.decorate('offerStore', { assertManager: vi.fn().mockResolvedValue(undefined) });
    app.addHook('preHandler', async (req) => { (req as any).user = { sub: 'manager', role: 'user' }; });
    await app.register(routes);
    try {
      const response = await app.inject({ method: 'POST', url: '/offers/offer-a/tracking/google-ads/destinations',
        payload: { name: 'A', customer_id: '1234567890', conversion_action_id: '123', enabled: true } });
      expect(response.statusCode).toBe(422);
      expect(db).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
});
