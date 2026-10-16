import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
vi.mock('../src/services/exchange-rate.js', () => ({
  getBrlRate: async () => 5,
  convertToBrlMinor: async (minor: number, currency: string) => ({
    brlMinor: currency === 'USD' ? minor * 5 : minor,
  }),
}));
import overview from '../src/routes/tracking-overview.js';
import { loadGatewayFees, totalGatewayFees } from '../src/services/gateway-fees.js';

const url = process.env.REFUNDS_TEST_DATABASE_URL;
describe.skipIf(!url)('overview reversal accounting (disposable PostgreSQL)', () => {
  const db = postgres(url ?? 'postgres://unused', { max: 1 });
  const id = `reversal-test-${randomUUID()}`;
  beforeAll(async () => {
    await db`INSERT INTO tracking_projects(id,offer_id,public_key) VALUES(${id},${id},${id})`;
    for (const [suffix, refund, chargeback] of [
      ['refund-first', '2026-09-15T12:00Z', '2026-09-16T12:00Z'],
      ['charge-first', '2026-09-17T12:00Z', '2026-09-15T12:00Z'],
      ['tie', '2026-09-15T12:00Z', '2026-09-15T12:00Z'],
    ]) {
      await db`INSERT INTO tracking_orders(id,project_id,provider,external_id,status,order_kind,paid_at,occurred_at,
        refunded_at,chargeback_at,amount_minor,amount_brl_minor,currency)
        VALUES(${id + suffix},${id},'vendepay',${id + suffix},'chargeback','front','2026-09-01T12:00Z','2026-09-01T12:00Z',
        ${refund},${chargeback},10000,10000,'BRL')`;
    }
  });
  afterAll(async () => {
    await db`DELETE FROM tracking_projects WHERE id=${id}`;
    await db.end();
  });
  it('deduplicates first reversal principal and penalty while keeping approved gross', async () => {
    const app = Fastify();
    app.decorate('db', db);
    app.decorate('offerStore', {
      listAccessible: async () => [{ id, name: 'Test', userId: 'owner' }],
    });
    app.decorate('userStore', { maybeGetById: async () => ({ name: 'Owner' }) });
    app.decorate('analyticsCache', {
      getOrSet: async (_key: unknown, callback: () => unknown) => callback(),
    });
    app.addHook('preHandler', async (req) => {
      req.user = { sub: 'owner', role: 'user' } as any;
    });
    await app.register(overview);
    try {
      const res = await app.inject('/tracking/overview?from=2026-09-01&to=2026-09-30');
      expect(res.statusCode).toBe(200);
      const body = res.json();
      const totals = body.accounts[0].totals;
      expect(totals.gross_revenue_brl_minor).toBe('30000');
      expect(totals.refunded_orders + totals.chargeback_orders).toBe(3);
      expect(
        Number(totals.refunded_revenue_brl_minor) + Number(totals.chargeback_revenue_brl_minor),
      ).toBe(30000);
      expect(totals.refund_chargeback_fee_count).toBe(3);
      expect(totals.refund_chargeback_fee_brl_minor).toBe('40500');
    } finally {
      await app.close();
    }
  });
  it('does not move a prior reversal to the date of its second lifecycle marker', async () => {
    const fees = totalGatewayFees(
      (
        await loadGatewayFees(
          db,
          [id],
          new Date('2026-09-16T03:00Z'),
          new Date('2026-09-18T03:00Z'),
        )
      ).get(id) ?? [],
    );
    expect(fees.penalties).toBe(0);
    expect(fees.penaltyCount).toBe(0);
  });
});
