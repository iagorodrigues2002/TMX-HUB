import postgres from 'postgres';
import { expect, it, vi } from 'vitest';
vi.mock('../src/services/exchange-rate.js', () => ({
  convertToBrlMinor: async (minor: number, currency: string) => ({
    brlMinor: currency === 'USD' ? minor * 5 : minor,
  }),
}));
import plugin from '../src/routes/refunds-dashboard.js';
import { loadTrackingSummary } from '../src/routes/tracking-admin/load-tracking-summary.js';
import { loadOverviewRows } from '../src/routes/tracking-overview/load-overview-rows.js';
import { loadGatewayFees, totalGatewayFees } from '../src/services/gateway-fees.js';
import type { buildRefundAnalytics } from '../src/services/refund-analytics.js';
import { loadReceivedReversals } from '../src/services/refund-receipts.js';

const url = process.env.REFUNDS_TEST_DATABASE_URL;
it.skipIf(!url)(
  'refund route uses first receipt before period filtering and reconciles all origins without cross-account evidence',
  async () => {
    if (!['localhost', '127.0.0.1'].includes(new URL(url!).hostname))
      throw new Error('Local DB only');
    const db = postgres(url!, { max: 1 });
    try {
      await db.begin(async (sql) => {
        await sql`CREATE TEMP TABLE companies(id text,name text) ON COMMIT DROP`;
        await sql`CREATE TEMP TABLE company_memberships(company_id text,user_id text,status text) ON COMMIT DROP`;
        await sql`CREATE TEMP TABLE company_offers(company_id text,offer_id text,owner_user_id text) ON COMMIT DROP`;
        await sql`CREATE TEMP TABLE tracking_projects(id text,offer_id text,enabled boolean DEFAULT true) ON COMMIT DROP`;
        await sql`CREATE TEMP TABLE tracking_orders(id text,project_id text,external_id text,status text,order_kind text,paid_at timestamptz,refunded_at timestamptz,chargeback_at timestamptz,provider text,vendepay_connection_id text,gateway_connection_id text,syzepay_connection_id text,product jsonb,buyer jsonb,amount_brl_minor bigint,amount_minor bigint,currency text) ON COMMIT DROP`;
        await sql`ALTER TABLE tracking_orders ADD COLUMN occurred_at timestamptz DEFAULT '2026-09-01T12:00Z',ADD COLUMN updated_at timestamptz DEFAULT '2026-09-01T12:00Z',ADD COLUMN cancelled_at timestamptz,ADD COLUMN visitor_id text,ADD COLUMN attribution_source jsonb DEFAULT '{}'`;
        await sql`CREATE TEMP TABLE vendepay_connections(id text,project_id text,name text,payload_adapter text) ON COMMIT DROP`;
        await sql`CREATE TEMP TABLE tracking_gateway_connections(id text,project_id text,name text,provider text,fee_settings jsonb) ON COMMIT DROP`;
        await sql`CREATE TEMP TABLE syzepay_company_connections(id text,name text,fee_settings jsonb,company_name text,owner_id text) ON COMMIT DROP`;
        await sql`CREATE TEMP TABLE exchange_rate_cache(base_currency text,target_currency text,rate numeric) ON COMMIT DROP`;
        await sql`CREATE TEMP TABLE tracking_upsell_operator_attempts(project_id text,order_id text,view_only boolean,opened_at timestamptz) ON COMMIT DROP`;
        await sql`CREATE TEMP TABLE tracking_upsell_operator_credits(project_id text,order_id text,operator_id text,reason text,front_order_id text) ON COMMIT DROP`;
        await sql`CREATE TEMP TABLE webhook_receipts(id text,order_id text,connection_id text,payload jsonb,received_at timestamptz,state text) ON COMMIT DROP`;
        await sql`CREATE TEMP TABLE tracking_gateway_webhook_receipts(order_id text,gateway_connection_id text,payload jsonb,received_at timestamptz,state text) ON COMMIT DROP`;
        await sql`INSERT INTO companies VALUES ('00000000-0000-4000-8000-000000000001','TMX'),('00000000-0000-4000-8000-000000000002','TMX')`;
        await sql`INSERT INTO company_memberships VALUES ('00000000-0000-4000-8000-000000000001','owner','active')`;
        await sql`INSERT INTO company_offers VALUES ('00000000-0000-4000-8000-000000000001','mine','owner'),('00000000-0000-4000-8000-000000000002','foreign','other-owner')`;
        await sql`INSERT INTO tracking_projects(id,offer_id) VALUES ('p','mine'),('foreign-p','foreign')`;
        await sql`INSERT INTO vendepay_connections VALUES ('c','p','Mainex',NULL),('foreign-c','foreign-p','Mainex',NULL)`;
        await sql`INSERT INTO exchange_rate_cache VALUES ('USD','BRL',5)`;
        for (const [id, kind, amount, project] of [
          ['natural', 'front', 10000, 'p'],
          ['assisted', 'front', 20000, 'p'],
          ['unknown', 'upsell', 30000, 'p'],
          ['no-receipt', 'upsell', 40000, 'p'],
          ['legacy', 'upsell', 35000, 'p'],
          ['foreign', 'front', 990000, 'foreign-p'],
        ] as const) {
          await sql`INSERT INTO tracking_orders(id,project_id,external_id,status,order_kind,paid_at,chargeback_at,provider,vendepay_connection_id,product,buyer,amount_brl_minor,amount_minor,currency)
          VALUES (${id},${project},${id},'chargeback',${kind},'2026-09-01T12:00:00Z','2026-09-01T12:00:00Z','vendepay',${project === 'p' ? 'c' : 'foreign-c'},'{}','{}',${amount},${amount},'BRL')`;
        }
        await sql`INSERT INTO tracking_upsell_operator_attempts VALUES ('p','assisted',false,'2026-08-31T12:00:00Z'),('p','natural',true,'2026-08-31T12:00:00Z'),('p','natural',false,'2026-09-02T12:00:00Z')`;
        for (const id of ['natural', 'assisted', 'unknown', 'foreign']) {
          for (const [suffix, received] of [
            ['first', '2026-10-16T02:30:00Z'],
            ['replay', '2026-10-16T12:00:00Z'],
          ]) {
            await sql`INSERT INTO webhook_receipts VALUES (${`${id}-${suffix}`},${id},${id === 'foreign' ? 'foreign-c' : 'c'},${sql.json({ checkoutId: id, event: 'chargeback', createdAt: '2026-09-01T12:00:00Z' })},${received},'processed')`;
          }
        }
        // A processed approval and a foreign connection's refund are NOT evidence for this order.
        await sql`INSERT INTO webhook_receipts VALUES ('approval','no-receipt','c',${sql.json({ checkoutId: 'no-receipt', event: 'compra.aprovada', status: 2 })},'2026-10-15T12:00:00Z','processed'),('foreign-refund','no-receipt','foreign-c',${sql.json({ checkoutId: 'no-receipt', event: 'chargeback' })},'2026-10-15T12:00:00Z','processed')`;
        await sql`INSERT INTO webhook_receipts VALUES ('legacy-receipt','legacy','c',${sql.json({ checkoutId: 'legacy', event: 'chargeback', createdAt: '2026-09-01T12:00:00Z' })},'2026-10-15T12:00:00Z','processable')`;
        await sql`INSERT INTO webhook_receipts VALUES ('legacy-replay','legacy','c',${sql.json({ checkoutId: 'legacy', event: 'chargeback' })},'2026-10-16T12:00:00Z','processed')`;
        for (const state of ['received', 'failed', 'quarantined']) {
          await sql`INSERT INTO webhook_receipts VALUES (${`not-applied-${state}`},'no-receipt','c',${sql.json({ checkoutId: 'no-receipt', event: 'chargeback' })},'2026-10-15T12:00:00Z',${state})`;
        }
        // One sale can have both lifecycle markers and two valid event types.
        // Its principal and penalty remain unique, at the first received event.
        await sql`UPDATE tracking_orders SET refunded_at=chargeback_at WHERE id='natural'`;
        await sql`INSERT INTO webhook_receipts VALUES ('natural-refund','natural','c',${sql.json({ checkoutId: 'natural', event: 'refund' })},'2026-10-16T02:30:00Z','processed')`;
        let handler: ((req: unknown, reply: unknown) => Promise<unknown>) | undefined;
        await plugin(
          {
            db: sql,
            offerStore: {
              listAccessible: async () => [
                { id: 'mine', userId: 'owner', companyName: 'TMX', name: 'PJR_ENG' },
                { id: 'foreign', userId: 'other-owner', companyName: 'TMX', name: 'OTHER' },
              ],
            },
            get: (_path: string, fn: NonNullable<typeof handler>) => {
              handler = fn;
            },
          } as unknown as Parameters<typeof plugin>[0],
          {},
        );
        const report = async (
          sales_view: string,
          date = '2026-10-15',
          filters: Record<string, string> = {},
        ) => {
          expect(handler).toBeDefined();
          return (await handler!(
            {
              user: { sub: 'owner', role: 'admin' },
              query: { from: date, to: date, sales_view, ...filters },
            },
            {
              code: (n: number) => {
                throw new Error(`HTTP ${n}`);
              },
            },
          )) as ReturnType<typeof buildRefundAnalytics>;
        };
        const general = await report('general');
        expect(general.totals.count).toBe(4);
        expect(general.totals.brl_minor).toBe(95000);
        expect(general.origin_totals.natural.brl_minor).toBe(10000);
        expect(general.origin_totals.assisted.brl_minor).toBe(20000);
        expect(general.origin_totals.unknown.brl_minor).toBe(65000);
        expect(general.undated_refunds.count).toBe(1);
        expect(general.undated_refunds.brl_minor).toBe(40000);
        expect(general.month_origin.months[0]).toMatchObject({
          month: '2026-10',
          partial_month: true,
          total: { count: 4, brl_minor: 95000 },
        });
        expect(
          general.month_origin.months[0]!.groups.find((group) => group.key === 'previous_month'),
        ).toMatchObject({ count: 4, brl_minor: 95000, share_pct: 100, purchase_month: '2026-09' });
        expect((await report('natural')).totals.brl_minor).toBe(10000);
        expect((await report('assisted')).totals.brl_minor).toBe(20000);
        expect((await report('natural')).month_origin.months[0]!.total.brl_minor).toBe(10000);
        expect((await report('assisted')).month_origin.months[0]!.total.brl_minor).toBe(20000);
        expect((await report('natural')).origin_totals.general.brl_minor).toBe(95000);
        expect((await report('general', '2026-10-16')).totals.count).toBe(0);
        expect((await report('general', '2026-10-16')).month_origin.months[0]!.total.count).toBe(0);
        expect((await report('general', '2026-09-01')).totals.count).toBe(0);
        // These are the actual shared query loaders, not mocked totals. A
        // purchase-date refund, a replay and a foreign receipt cannot leak in.
        const app = { db: sql } as unknown as Parameters<typeof loadOverviewRows>[0];
        for (const [start, end, expected, count] of [
          ['2026-10-15T03:00Z', '2026-10-16T03:00Z', 95000, 4],
          ['2026-10-16T03:00Z', '2026-10-17T03:00Z', 0, 0],
          ['2026-09-01T03:00Z', '2026-09-02T03:00Z', 0, 0],
        ] as const) {
          for (const view of ['general', 'natural'] as const) {
            const from = new Date(start);
            const to = new Date(end);
            const reversals = await loadReceivedReversals(sql as never, ['mine'], from, to, view);
            expect(new Set([...reversals.refunded, ...reversals.chargeback]).size).toBe(
              reversals.refunded.length + reversals.chargeback.length,
            );
            expect([...reversals.refunded, ...reversals.chargeback]).not.toContain('no-receipt');
            const { rows } = await loadOverviewRows(
              app,
              ['mine'],
              from,
              to,
              'owner',
              view,
              reversals,
            );
            const summary = await loadTrackingSummary(
              app,
              { params: { id: 'mine' } } as never,
              from,
              to,
              view,
              reversals,
            );
            const fees = totalGatewayFees(
              (await loadGatewayFees(sql as never, ['mine'], from, to, view, reversals)).get(
                'mine',
              ) ?? [],
            );
            const amount = expected && view === 'natural' ? 10000 : expected;
            const expectedCount = count && view === 'natural' ? 1 : count;
            for (const row of [rows[0]!, summary!]) {
              expect(
                Number(row.refunded_revenue_brl_minor) + Number(row.chargeback_revenue_brl_minor),
              ).toBe(amount);
              expect(row.refunded_orders + row.chargeback_orders).toBe(expectedCount);
            }
            expect(fees.penaltyCount).toBe(expectedCount);
            expect(fees.penalties).toBe(expectedCount * 13500);
            if (expected) {
              expect(fees.penalties).toBe((await report(view)).totals.fee_brl_minor);
              expect(amount).toBe((await report(view)).totals.brl_minor);
            }
            const purchasePeriod = start.startsWith('2026-09');
            expect(Number(rows[0]!.paid_revenue_brl_minor)).toBe(
              purchasePeriod ? (view === 'natural' ? 10000 : 135000) : 0,
            );
            expect(fees.reserve).toBe(0); // returned purchases remain excluded from reserve
            expect(fees.fees).toBe(purchasePeriod ? (view === 'natural' ? 1735 : 17090) : 0);
          }
        }
        expect(
          general.origin_totals.natural.brl_minor +
            general.origin_totals.assisted.brl_minor +
            general.origin_totals.unknown.brl_minor,
        ).toBe(general.totals.brl_minor);
        expect(
          (
            await report('general', '2026-10-15', {
              company_id: '00000000-0000-4000-8000-000000000001',
            })
          ).month_origin.months[0]!.total.brl_minor,
        ).toBe(95000);
        for (const filters of [
          { provider: 'syzepay' },
          { vendepay: 'cobrak' },
          { product: 'Other' },
        ]) {
          expect(
            (await report('general', '2026-10-15', filters)).month_origin.months[0]!.total.count,
          ).toBe(0);
        }
      });
    } finally {
      await db.end();
    }
  },
);
