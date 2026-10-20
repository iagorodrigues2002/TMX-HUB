import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  recoverWebhookAttribution,
  recoverableWebhookSource,
} from '../src/services/webhook-attribution-recovery.js';

const payload = {
  transaction_id: 'original-order',
  event: 'paid',
  attribution: { ad_id: '123456789012345', fbclid: 'original-click', utm_source: 'fb' },
};
describe('historical webhook attribution recovery', () => {
  it('recovers only attribution of the same approved transaction without changing financial metadata', () => {
    expect(recoverableWebhookSource('original-order', { country: 'DE' }, payload)).toEqual({
      country: 'DE',
      ad_id: '123456789012345',
      fbclid: 'original-click',
      utm_source: 'fb',
    });
  });
  it('rejects another order, non-approved receipts, or a snapshot already containing attribution', () => {
    expect(recoverableWebhookSource('other', {}, payload)).toBeNull();
    expect(
      recoverableWebhookSource('original-order', {}, { ...payload, event: 'refunded' }),
    ).toBeNull();
    expect(recoverableWebhookSource('original-order', { ad_id: 'existing' }, payload)).toBeNull();
  });
  it('leaves missing data absent and does not restore unrelated payload fields', () => {
    expect(
      recoverableWebhookSource(
        'original-order',
        {},
        {
          ...payload,
          attribution: { sessionId: 'not-ad-data' },
        },
      ),
    ).toBeNull();
  });
});

const url = process.env.ATTRIBUTION_TEST_DATABASE_URL;
describe.skipIf(!url)('transactional historical recovery (isolated PostgreSQL)', () => {
  const db = postgres(url ?? 'postgres://unused', { max: 1 });
  const schema = `recovery_test_${randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    await db.unsafe(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
      CREATE TABLE tracking_orders(id text PRIMARY KEY,project_id text,external_id text,
        provider text,visitor_id text,status text,occurred_at timestamptz,paid_at timestamptz,
        attribution_source jsonb,gateway_connection_id text,amount_minor int);
      CREATE TABLE tracking_events(id text,project_id text,visitor_id text,received_at timestamptz,
        client_at timestamptz,event_name text,source jsonb,click_ids jsonb);
      CREATE TABLE tracking_gateway_webhook_receipts(id text PRIMARY KEY,order_id text,
        gateway_connection_id text,payload jsonb,received_at timestamptz);`);
    for (const file of [
      '099_paid_attribution_snapshot.sql',
      '102_paid_attribution_webhook_fallback.sql',
      '103_attribution_recovery_audit.sql',
    ]) {
      await db.unsafe(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    }
    await db`INSERT INTO tracking_orders(id,project_id,external_id,provider,status,occurred_at,paid_at,
      attribution_source,gateway_connection_id,amount_minor)
      VALUES('o','p','original-order','paysight','paid','2026-10-01','2026-10-01','{"country":"DE"}','c',2900)`;
    await db`INSERT INTO tracking_gateway_webhook_receipts VALUES
      ('r','o','c',${db.json(payload)},'2026-10-01')`;
  });
  afterAll(async () => {
    await db.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await db.end();
  });
  it('dry-runs, restores once and preserves money, identifiers and the immutable trigger', async () => {
    expect(await recoverWebhookAttribution(db)).toEqual({
      candidates: 1,
      updated: 0,
      deliveriesCreated: 0,
    });
    expect(await recoverWebhookAttribution(db, true)).toEqual({
      candidates: 1,
      updated: 1,
      deliveriesCreated: 0,
    });
    expect(await recoverWebhookAttribution(db, true)).toEqual({
      candidates: 0,
      updated: 0,
      deliveriesCreated: 0,
    });
    await db`UPDATE tracking_orders SET attribution_source='{"ad_id":"overwrite"}' WHERE id='o'`;
    const [order] = await db`SELECT * FROM tracking_orders WHERE id='o'`;
    expect(order!.attribution_source.ad_id).toBe('123456789012345');
    expect(order!.external_id).toBe('original-order');
    expect(order!.amount_minor).toBe(2900);
    const [audit] = await db`SELECT * FROM tracking_attribution_repairs WHERE order_id='o'`;
    expect(audit!.source_before).toEqual({ country: 'DE' });
  });
  it('rolls back source and re-enables the snapshot guard if audit persistence fails', async () => {
    await db`INSERT INTO tracking_orders(id,project_id,external_id,provider,status,occurred_at,paid_at,
      attribution_source,gateway_connection_id) VALUES('rollback','p','original-order','paysight',
      'paid','2026-10-01','2026-10-01','{}','c')`;
    await db`INSERT INTO tracking_gateway_webhook_receipts VALUES
      ('rollback-r','rollback','c',${db.json(payload)},'2026-10-01')`;
    await db.unsafe(`ALTER TABLE tracking_attribution_repairs
      ADD CONSTRAINT force_failure CHECK(order_id <> 'rollback')`);
    await expect(recoverWebhookAttribution(db, true)).rejects.toThrow();
    const [order] = await db`SELECT attribution_source FROM tracking_orders WHERE id='rollback'`;
    expect(order!.attribution_source).toEqual({});
    const [trigger] = await db`SELECT tgenabled FROM pg_trigger
      WHERE tgrelid='tracking_orders'::regclass AND tgname='tracking_orders_freeze_attribution'`;
    expect(trigger!.tgenabled).toBe('O');
  });
});
