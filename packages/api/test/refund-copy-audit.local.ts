// Read-only audit against an explicitly supplied, isolated local copy. No server/workers.
import assert from 'node:assert/strict';
import Redis from 'ioredis';
import postgres from 'postgres';
import { normalizeVendepay } from '../src/integrations/vendepay/normalize.js';
import plugin from '../src/routes/refunds-dashboard.js';
import type { RefundOrder, buildRefundAnalytics } from '../src/services/refund-analytics.js';
import {
  type RefundDateReceipt,
  recoverRefundDateEvidence,
} from '../src/services/refund-date-evidence.js';

const databaseUrl = process.env.REFUNDS_TEST_DATABASE_URL!;
const redisUrl = process.env.REFUNDS_TEST_REDIS_URL!;
for (const url of [databaseUrl, redisUrl]) {
  assert.ok(url && ['localhost', '127.0.0.1'].includes(new URL(url).hostname), 'Local copies only');
}
const db = postgres(databaseUrl, { max: 1 });
const redis = new Redis(redisUrl);
try {
  const hashes = async (match: string) => {
    let cursor = '0';
    const values: Record<string, string>[] = [];
    do {
      const [next, keys] = await redis.scan(cursor, 'MATCH', match, 'COUNT', 100);
      cursor = next;
      for (const key of keys)
        if ((await redis.type(key)) === 'hash') values.push(await redis.hgetall(key));
    } while (cursor !== '0');
    return values;
  };
  const users = await hashes('user:*');
  const user = users.find((u) => u.name?.toLowerCase() === 'iago rodrigues');
  assert.ok(user?.id, 'Expected local Iago account');
  const offers = await hashes('offer:*');
  const scoped = offers.filter(
    (o) => o.userId === user.id && o.companyName?.trim().toLowerCase() === 'tmx',
  );
  assert.ok(scoped.length, 'Expected owned TMX offers');
  const periods = [
    { label: 'october', from: '2026-10-01', to: '2026-10-31' },
    { label: 'november', from: '2026-11-01', to: '2026-11-02' },
    { label: 'full_history', from: '2026-05-01', to: '2026-11-02' },
  ];
  await db.begin('read only', async (sql) => {
    await sql`SET LOCAL statement_timeout='60s'`;
    let handler: ((req: unknown, reply: unknown) => Promise<unknown>) | undefined;
    await plugin(
      {
        db: sql,
        offerStore: { listAccessible: async () => offers },
        get: (_path: string, fn: NonNullable<typeof handler>) => {
          handler = fn;
        },
      } as unknown as Parameters<typeof plugin>[0],
      {},
    );
    assert.ok(handler);
    const reply = {
      code: (code: number) => {
        throw new Error(`HTTP ${code}`);
      },
    };
    const output = [];
    for (const period of periods) {
      const started = performance.now();
      const report = (await handler(
        { user: { sub: user.id, role: 'admin' }, query: period },
        reply,
      )) as ReturnType<typeof buildRefundAnalytics>;
      assert.ok(report.origin_totals);
      for (const field of ['count', 'brl_minor', 'fee_brl_minor', 'impact_brl_minor'] as const) {
        const origins = report.origin_totals;
        assert.equal(
          origins.general[field],
          origins.natural[field] + origins.assisted[field] + origins.unknown[field],
        );
      }
      const money = (v: Record<string, unknown>) => ({
        count: v.count,
        refund_minor: v.brl_minor,
        fees_minor: v.fee_brl_minor,
        impact_minor: v.impact_brl_minor,
      });
      const [storedBaseline] =
        await sql`SELECT count(*)::int count,COALESCE(sum(o.amount_brl_minor),0)::text refund_minor
        FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
        WHERE p.offer_id=ANY(${scoped.map((o) => o.id)})
          AND (LEAST(o.refunded_at,o.chargeback_at) AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN ${period.from}::date AND ${period.to}::date`;
      output.push({
        period: period.label,
        stored_timestamp_baseline: storedBaseline,
        query_ms: Math.round(performance.now() - started),
        totals: money(report.totals),
        origins: Object.fromEntries(
          Object.entries(report.origin_totals).map(([key, value]) => [
            key,
            money(value as Record<string, unknown>),
          ]),
        ),
        undated: money(report.undated_refunds),
        delay: { samples: report.delay.sample_count, mean_days: report.delay.mean_days },
      });
    }
    const reversed = await sql<
      RefundOrder[]
    >`SELECT o.*,LEAST(o.refunded_at,o.chargeback_at) reversal_at,p.offer_id
      FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id WHERE p.offer_id=ANY(${scoped.map((o) => o.id)}) AND (o.refunded_at IS NOT NULL OR o.chargeback_at IS NOT NULL OR o.status IN ('refunded','chargeback'))`;
    const allReceipts = await sql<
      Array<RefundDateReceipt & { state: string; matched: boolean }>
    >`SELECT wr.order_id,o.external_id,wr.payload,wr.received_at,wr.state,
      (wr.connection_id=o.vendepay_connection_id AND vc.project_id=o.project_id) matched
      FROM webhook_receipts wr JOIN tracking_orders o ON o.id=wr.order_id
      LEFT JOIN vendepay_connections vc ON vc.id=wr.connection_id WHERE wr.order_id=ANY(${reversed.map((r) => r.id)})`;
    const confirmed = allReceipts.filter(
      (r) => r.matched && ['processed', 'processable'].includes(r.state),
    );
    const missing = recoverRefundDateEvidence(reversed, confirmed).filter(
      (r) => r.reversal_received_missing,
    );
    const coverage = {
      reversed: reversed.length,
      without_any_receipt: 0,
      without_processed_matched_receipt: 0,
      only_non_reversal_receipts: 0,
      reversal_transaction_mismatch: 0,
      by_purchase_month: {} as Record<string, number>,
      raw_states: {} as Record<string, number>,
    };
    for (const order of missing) {
      const raw = allReceipts.filter((r) => r.order_id === order.id);
      const processed = confirmed.filter((r) => r.order_id === order.id);
      if (!raw.length) coverage.without_any_receipt++;
      else if (!processed.length) coverage.without_processed_matched_receipt++;
      else {
        const events = processed.map((r) => normalizeVendepay(r.payload, new Date(r.received_at)));
        if (
          events.some(
            (r) => r.kind === 'processable' && ['refunded', 'chargeback'].includes(r.event.status),
          )
        )
          coverage.reversal_transaction_mismatch++;
        else coverage.only_non_reversal_receipts++;
      }
      const month = order.paid_at ? new Date(order.paid_at).toISOString().slice(0, 7) : 'unknown';
      coverage.by_purchase_month[month] = (coverage.by_purchase_month[month] ?? 0) + 1;
      for (const r of raw) {
        const key = `${r.state}:exact_connection_project=${r.matched}`;
        coverage.raw_states[key] = (coverage.raw_states[key] ?? 0) + 1;
      }
    }
    const lifecycleRows = await sql`SELECT wr.payload,wr.received_at,wr.state,wr.order_id,
      o.external_id,o.status,o.refunded_at,o.chargeback_at,
      (o.vendepay_connection_id=wr.connection_id AND o.project_id=vc.project_id) exact_account
      FROM webhook_receipts wr JOIN vendepay_connections vc ON vc.id=wr.connection_id
      JOIN tracking_projects p ON p.id=vc.project_id LEFT JOIN tracking_orders o ON o.id=wr.order_id
      WHERE p.offer_id=ANY(${scoped.map((o) => o.id)}) AND COALESCE(vc.payload_adapter,'')<>'explodely'`;
    const lifecycle = {
      examined: lifecycleRows.length,
      refund_receipts: 0,
      unlinked: 0,
      not_reversed_orders: 0,
      transaction_mismatch: 0,
      account_mismatch: 0,
      states: {} as Record<string, number>,
    };
    for (const row of lifecycleRows) {
      const normalized = normalizeVendepay(row.payload, new Date(row.received_at));
      if (
        normalized.kind !== 'processable' ||
        !['refunded', 'chargeback'].includes(normalized.event.status)
      )
        continue;
      lifecycle.refund_receipts++;
      lifecycle.states[row.state] = (lifecycle.states[row.state] ?? 0) + 1;
      if (!row.order_id || !row.external_id) lifecycle.unlinked++;
      else {
        if (normalized.event.transactionId !== row.external_id) lifecycle.transaction_mismatch++;
        if (!row.exact_account) lifecycle.account_mismatch++;
        if (
          !row.refunded_at &&
          !row.chargeback_at &&
          !['refunded', 'chargeback'].includes(row.status)
        )
          lifecycle.not_reversed_orders++;
      }
    }
    console.log(
      JSON.stringify(
        {
          scoped_offers: scoped.length,
          periods: output,
          missing_receipt_diagnosis: coverage,
          all_receipts_lifecycle_audit: lifecycle,
        },
        null,
        2,
      ),
    );
  });
} finally {
  await redis.quit();
  await db.end();
}
