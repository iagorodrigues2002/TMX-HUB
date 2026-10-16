import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import postgres from 'postgres';
import plugin from '../src/routes/refunds-dashboard.js';
import {
  buildRefundAnalytics,
  validDate,
  type RefundOrder,
} from '../src/services/refund-analytics.js';
const row = (patch: Partial<RefundOrder> = {}): RefundOrder => ({
  id: 'a',
  offer_id: 'offer',
  offer_name: 'Oferta',
  provider: 'vendepay',
  connection_name: 'Mainex',
  product_name: 'Front',
  paid_at: '2026-09-01T12:00:00Z',
  reversal_at: '2026-10-01T12:00:00Z',
  amount_brl_minor: 10000,
  penalty_brl_minor: 2700,
  ...patch,
});
describe('unified reversal analytics', () => {
  it('validates actual calendar dates', () => {
    expect(validDate('2026-02-30')).toBe(false);
    expect(validDate('2024-02-29')).toBe(true);
    expect(validDate('0000-01-01')).toBe(false);
  });
  it('separates lifecycle cash impact from purchase cohort attribution', () => {
    const result = buildRefundAnalytics(
      [
        row(),
        row({ id: 'b', paid_at: '2026-10-01T15:00Z', reversal_at: null, amount_brl_minor: 20000 }),
      ],
      '2026-10-01',
      '2026-10-01',
      'day',
      '2026-10-16',
    );
    expect(result.totals).toMatchObject({
      count: 1,
      sales: 1,
      gross_brl_minor: 20000,
      brl_minor: 10000,
      rate_pct: 50,
      impact_brl_minor: 12700,
      impact_pct: 63.5,
    });
    expect(result.cohorts[0]).toMatchObject({ sales: 1, count: 0, immature: true });
  });
  it('uses first-event chosen penalty and never adds duplicate reversal amounts', () => {
    const result = buildRefundAnalytics([row()], '2026-10-01', '2026-10-01', 'day', '2026-10-16');
    expect(result.totals.count).toBe(1);
    expect(result.totals.fee_brl_minor).toBe(2700);
    expect(result.delay.mean_days).toBe(30);
  });
  it('marks absent FX and fees instead of reporting a false zero rate', () => {
    const result = buildRefundAnalytics(
      [row({ paid_at: '2026-10-01T12:00Z', amount_brl_minor: null, penalty_brl_minor: null })],
      '2026-10-01',
      '2026-10-01',
      'day',
      '2026-10-16',
    );
    expect(result.totals).toMatchObject({
      missing_brl_orders: 1,
      missing_fee_orders: 1,
      rate_pct: null,
      impact_pct: null,
    });
  });
  it('fills zero days and computes a rolling seven-bucket average', () => {
    const result = buildRefundAnalytics([row()], '2026-10-01', '2026-10-08', 'day', '2026-10-16');
    expect(result.trend).toHaveLength(8);
    expect(result.trend[1]!.moving_average_brl_minor).toBe(5000);
    expect(result.trend[7]!.moving_average_brl_minor).toBe(0);
    expect(result.comparison.previous_from).toBe('2026-09-23');
    expect(result.comparison.previous_to).toBe('2026-09-30');
  });
  it('uses Sao Paulo midnight and ranks only selected period', () => {
    const result = buildRefundAnalytics(
      [row({ reversal_at: '2026-10-02T02:59:59Z' })],
      '2026-10-01',
      '2026-10-01',
      'day',
      '2026-10-16',
    );
    expect(result.totals.count).toBe(1);
    expect(result.rankings.gateways[0]!.count).toBe(1);
  });
  it('counts later refunds in their original purchase-month cohort', () => {
    const result = buildRefundAnalytics([row()], '2026-09-01', '2026-09-30', 'month', '2026-10-16');
    expect(result.totals.count).toBe(0);
    expect(result.cohorts[0]).toMatchObject({ month: '2026-09', count: 1, rate_pct: 100 });
  });
});
const url = process.env.REFUNDS_TEST_DATABASE_URL;
describe.skipIf(!url)('refund dashboard SQL against disposable PostgreSQL', () => {
  const db = postgres(url ?? 'postgres://unused', { max: 1 });
  const id = 'refund-' + randomUUID();
  beforeAll(async () => {
    await db`INSERT INTO tracking_projects(id,offer_id,public_key) VALUES(${id},${id},${id})`;
    await db`INSERT INTO vendepay_connections(id,project_id,token_hash,name) VALUES(${id},${id},${id},'VendePay Mainex')`;
    await db`INSERT INTO tracking_orders(id,project_id,provider,external_id,status,order_kind,paid_at,occurred_at,refunded_at,chargeback_at,amount_minor,amount_brl_minor,currency,vendepay_connection_id) VALUES(${id},${id},'vendepay',${id},'chargeback','front','2026-09-01T12:00Z','2026-09-01T12:00Z','2026-10-01T12:00Z','2026-10-02T12:00Z',10000,10000,'BRL',${id})`;
    await db`INSERT INTO tracking_gateway_connections(id,project_id,provider,name,fee_settings) VALUES(${id + '-gc'},${id},'paysight','Custom tariff',${db.json({ refund_fee_minor: 125, chargeback_fee_minor: 450, penalty_currency: 'BRL' })})`;
    await db`INSERT INTO tracking_orders(id,project_id,provider,external_id,status,order_kind,paid_at,occurred_at,refunded_at,chargeback_at,amount_minor,amount_brl_minor,currency,gateway_connection_id) VALUES(${id + '-custom'},${id},'paysight',${id + '-custom'},'chargeback','front','2026-08-01T12:00Z','2026-08-01T12:00Z','2026-10-03T12:00Z','2026-10-03T12:00Z',1000,1000,'BRL',${id + '-gc'})`;
    await db`INSERT INTO tracking_orders(id,project_id,provider,external_id,status,order_kind,occurred_at,refunded_at,amount_minor,amount_brl_minor,currency,vendepay_connection_id) VALUES(${id + '-unknown-paid'},${id},'vendepay',${id + '-unknown-paid'},'refunded','front','2026-10-04T12:00Z','2026-10-04T12:00Z',500,500,'BRL',${id})`;
  });
  afterAll(async () => {
    await db`DELETE FROM tracking_projects WHERE id=${id}`;
    await db.end();
  });
  const request = async (owner: boolean, path: string) => {
    const app = Fastify();
    app.decorate('db', db);
    app.decorate('offerStore', {
      listAccessible: async () => [
        { id, name: 'Oferta fixture', userId: 'owner', memberIds: ['legacy-member'] },
      ],
    });
    app.addHook('preHandler', async (req) => {
      req.user = { sub: owner ? 'owner' : 'legacy-member', role: 'user' } as any;
    });
    await app.register(plugin);
    try {
      return await app.inject(path);
    } finally {
      await app.close();
    }
  };
  it('dedupes refund then chargeback at first lifecycle date and retains paid gross/cohort', async () => {
    const r = await request(true, '/tracking/refunds-dashboard?from=2026-10-01&to=2026-10-02');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().totals).toMatchObject({ count: 1, brl_minor: 10000 });
    expect(r.json().trend[1].count).toBe(0);
    const cohort = await request(true, '/tracking/refunds-dashboard?from=2026-09-01&to=2026-09-30');
    expect(cohort.json().totals.gross_brl_minor).toBe(10000);
    expect(cohort.json().cohorts[0].count).toBe(1);
  });
  it('does not trust legacy shared membership to authorize data', async () => {
    const r = await request(false, '/tracking/refunds-dashboard?from=2026-10-01&to=2026-10-02');
    expect(r.statusCode).toBe(200);
    expect(r.json().totals.count).toBe(0);
    const selected = await request(false, `/tracking/refunds-dashboard?offer_id=${id}`);
    expect(selected.statusCode).toBe(404);
  });
  it('rejects calendar-invalid dates before SQL', async () => {
    const r = await request(true, '/tracking/refunds-dashboard?from=2026-02-30&to=2026-03-01');
    expect(r.statusCode).toBe(400);
  });
  it('applies isolated gateway tariffs with ties counted as refund once', async () => {
    const r = await request(
      true,
      '/tracking/refunds-dashboard?from=2026-10-03&to=2026-10-03&provider=paysight',
    );
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().totals).toMatchObject({
      count: 1,
      brl_minor: 1000,
      fee_brl_minor: 125,
      impact_brl_minor: 1125,
    });
  });
  it('retains reversal with missing paid receipt but excludes it from delay sample', async () => {
    const r = await request(true, '/tracking/refunds-dashboard?from=2026-10-04&to=2026-10-04');
    expect(r.statusCode, r.body).toBe(200);
    expect(r.json().totals.count).toBe(1);
    expect(r.json().delay).toMatchObject({ sample_count: 0, missing_paid_at: 1 });
  });
});
