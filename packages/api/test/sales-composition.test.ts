import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createResilientPostgresClient } from '../src/lib/postgres-retry.js';
import {
  type SalesCompositionRow,
  compositionTotals,
  registerGetSalesComposition,
} from '../src/routes/tracking-overview/get-sales-composition.js';

vi.hoisted(() => {
  process.env.JWT_SECRET ??= 'synthetic-natural-overview-test-only-32-characters';
});
const row = (extra: Partial<SalesCompositionRow> = {}): SalesCompositionRow => ({
  offer_id: 'offer',
  classification: null,
  orders: 3,
  fronts: 1,
  upsells: 2,
  customers: 1,
  unidentified_orders: 0,
  missing_amounts: 0,
  revenue_brl_minor: '60000',
  ...extra,
});
it('ARR divides summed revenue by customers, never by number of transactions or averages of ARR', () => {
  expect(compositionTotals([row()]).arr_brl_minor).toBe('60000');
  expect(
    compositionTotals([row(), row({ customers: 3, revenue_brl_minor: '20000' })]).arr_brl_minor,
  ).toBe('20000');
});
it('does not invent customer counts or exchange amounts', () => {
  expect(compositionTotals([]).arr_brl_minor).toBeNull();
  expect(compositionTotals([row({ unidentified_orders: 1 })]).arr_brl_minor).toBeNull();
  expect(compositionTotals([row({ missing_amounts: 1 })]).arr_brl_minor).toBeNull();
});
it('general ARPU uses front purchases, including all upsell revenue', () => {
  expect(
    compositionTotals(
      [
        row({ fronts: 78, customers: 96, revenue_brl_minor: '2501506' }),
        row({ fronts: 0, customers: 2, revenue_brl_minor: '187048' }),
      ],
      'fronts',
    ).arr_brl_minor,
  ).toBe('34469');
  expect(compositionTotals([row({ fronts: 0 })], 'fronts').arr_brl_minor).toBeNull();
  expect(
    compositionTotals([row({ fronts: 2, customers: 0, unidentified_orders: 3 })], 'fronts')
      .arr_brl_minor,
  ).toBe('30000');
  expect(compositionTotals([row({ missing_amounts: 1 })], 'fronts').arr_brl_minor).toBeNull();
});
async function appFor(db: unknown, authenticated = true) {
  const app = Fastify();
  app.decorate('db', db);
  app.decorate('offerStore', {
    listAccessible: async () => [{ id: 'offer', name: 'Oferta QA', userId: 'owner' }],
  });
  if (authenticated)
    app.addHook('preHandler', async (req) => {
      req.user = { sub: 'owner', role: 'user', email: 'qa@example.test', iat: 0, exp: 0 };
    });
  registerGetSalesComposition(app);
  return app;
}
it('returns general ARPU by front purchases from the endpoint', async () => {
  const db = Object.assign(
    vi.fn(async () => [row({ fronts: 2, customers: 1 })]),
    {
      unsafe: vi.fn(() => true),
    },
  );
  const app = await appFor(db);
  try {
    const result = await app.inject('/tracking/sales-composition?from=2026-10-01&to=2026-10-01');
    expect(result.statusCode).toBe(200);
    expect(result.json().offers[0].general.arr_brl_minor).toBe('30000');
  } finally {
    await app.close();
  }
});
it('rejects missing authentication and impossible calendar dates before querying storage', async () => {
  const db = vi.fn();
  const anonymous = await appFor(db, false);
  expect((await anonymous.inject('/tracking/sales-composition')).statusCode).toBe(401);
  await anonymous.close();
  const app = await appFor(db);
  expect(
    (await app.inject('/tracking/sales-composition?from=2026-02-30&to=2026-03-01')).statusCode,
  ).toBe(400);
  expect(db).not.toHaveBeenCalled();
  await app.close();
});

describe.skipIf(!process.env.TASK_TEST_DATABASE_URL)(
  'natural sales composition in isolated Postgres',
  () => {
    let db: ReturnType<typeof postgres>;
    let root: ReturnType<typeof postgres>;
    const schema = `natural_${randomUUID().replaceAll('-', '')}`;
    beforeAll(async () => {
      const url = new URL(process.env.TASK_TEST_DATABASE_URL!);
      if (
        url.hostname !== '127.0.0.1' ||
        url.pathname !== '/tmx_tasks_test' ||
        url.username !== 'tmx_tasks_test'
      )
        throw Error('Refusing non-disposable database');
      root = postgres(url.toString(), { max: 1 });
      await root.unsafe(`CREATE SCHEMA ${schema}`);
      db = postgres(url.toString(), { max: 1, connection: { search_path: schema } });
      await db.unsafe(
        'CREATE TABLE tracking_projects(id text PRIMARY KEY,offer_id text,enabled boolean);CREATE TABLE tracking_orders(id text PRIMARY KEY,project_id text,order_kind text,paid_at timestamptz,buyer jsonb,amount_brl_minor bigint,currency text,amount_minor bigint);CREATE TABLE tracking_upsell_operator_attempts(project_id text,order_id text,view_only boolean,opened_at timestamptz);CREATE TABLE tracking_upsell_operator_credits(order_id text,project_id text,front_order_id text,operator_id text,reason text);CREATE TABLE exchange_rate_cache(base_currency text,target_currency text,rate numeric);',
      );
      await db`INSERT INTO tracking_projects VALUES('project','offer',true),('private','private-offer',true)`;
      for (const [id, kind, amount, buyer, project, paid] of [
        [
          'front',
          'front',
          10000,
          { email: 'BUYER@example.test' },
          'project',
          '2026-10-01T12:00:00Z',
        ],
        ['natural', 'upsell', 20000, {}, 'project', '2026-10-01T12:10:00Z'],
        [
          'assisted',
          'upsell_2',
          30000,
          { email: 'buyer@example.test' },
          'project',
          '2026-10-01T12:20:00Z',
        ],
        [
          'unknown',
          'upsell_3',
          5000,
          { email: 'buyer@example.test' },
          'project',
          '2026-10-01T12:30:00Z',
        ],
        [
          'private',
          'front',
          999999,
          { email: 'private@example.test' },
          'private',
          '2026-10-01T13:00:00Z',
        ],
        [
          'unmapped-product',
          'unknown',
          2000,
          { email: 'buyer@example.test' },
          'project',
          '2026-10-01T12:40:00Z',
        ],
        [
          'later',
          'front',
          999999,
          { email: 'later@example.test' },
          'project',
          '2026-10-02T12:00:00Z',
        ],
      ] as const)
        await db`INSERT INTO tracking_orders VALUES(${id},${project},${kind},${paid},${db.json(buyer)},${amount},'BRL',${amount})`;
      await db`INSERT INTO tracking_upsell_operator_credits VALUES('natural','project','front',NULL,'no_preapproval_click'),('assisted','project','front','operator','last_preapproval_click')`;
      await db`INSERT INTO tracking_upsell_operator_attempts VALUES('project','front',false,'2026-10-01T14:00:00Z')`;
    });
    afterAll(async () => {
      await db?.end();
      if (root) {
        await root.unsafe(`DROP SCHEMA ${schema} CASCADE`);
        await root.end();
      }
    });
    it('keeps postapproval clicks natural, excludes assisted and unknown rows, deduplicates customers and respects offers/dates', async () => {
      const app = await appFor(createResilientPostgresClient(db));
      const result = await app.inject('/tracking/sales-composition?from=2026-10-01&to=2026-10-01');
      expect(result.statusCode).toBe(200);
      const [offer] = result.json().offers;
      expect(result.json().offers).toHaveLength(1);
      expect(offer.general).toMatchObject({
        orders: 5,
        customers: 1,
        revenue_brl_minor: '67000',
        arr_brl_minor: '67000',
      });
      expect(offer.natural).toMatchObject({
        orders: 2,
        fronts: 1,
        upsells: 1,
        customers: 1,
        revenue_brl_minor: '30000',
        arr_brl_minor: '30000',
      });
      expect(offer.unclassified_orders).toBe(2);
      expect(offer.assisted.revenue_brl_minor).toBe('30000');
      expect(offer.unclassified.revenue_brl_minor).toBe('7000');
      expect(Number(offer.general.revenue_brl_minor)).toBe(
        Number(offer.natural.revenue_brl_minor) +
          Number(offer.assisted.revenue_brl_minor) +
          Number(offer.unclassified.revenue_brl_minor),
      );
      await app.close();
    });
  },
);
