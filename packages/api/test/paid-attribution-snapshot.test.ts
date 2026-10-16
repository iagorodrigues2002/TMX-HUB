import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Explicit disposable database only; never falls back to DATABASE_URL.
const url = process.env.ATTRIBUTION_TEST_DATABASE_URL;
describe.skipIf(!url)('paid attribution snapshot (PostgreSQL)', () => {
  const db = postgres(url ?? 'postgres://unused', { max: 1 });
  const schema = `attribution_test_${randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    await db.unsafe(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
    await db.unsafe(`CREATE TABLE tracking_orders (
      id text PRIMARY KEY,project_id text,visitor_id text,status text,
      occurred_at timestamptz,paid_at timestamptz,attribution_source jsonb);
      CREATE TABLE tracking_events (id text PRIMARY KEY,project_id text,visitor_id text,
      received_at timestamptz,client_at timestamptz,event_name text,source jsonb,click_ids jsonb);
      INSERT INTO tracking_orders VALUES ('legacy','p','v','paid','2026-10-01','2026-10-01','{"ad_id":"legacy"}');`);
    await db.unsafe(await readFile(new URL('../migrations/099_paid_attribution_snapshot.sql', import.meta.url), 'utf8'));
    await db.unsafe(`INSERT INTO tracking_events VALUES
      ('old','p','v','2026-10-01 10:00Z','2026-10-01 10:00Z','PageView','{"ad_id":"old","campaign_id":"do-not-inherit"}','{}'),
      ('last','p','v','2026-10-01 11:00Z','2026-10-01 11:00Z','Click','{"ad_id":"last"}','{"fbclid":"last-click"}'),
      ('future','p','v','2026-10-01 13:00Z','2026-10-01 13:00Z','Click','{"ad_id":"future"}','{}'),
      ('other-project','other','v','2026-10-01 11:59Z','2026-10-01 11:59Z','Click','{"ad_id":"wrong-tenant"}','{}');`);
  });
  afterAll(async () => {
    await db.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await db.end();
  });
  const sale = async (id: string, visitor = 'v', status = 'paid') => {
    await db`INSERT INTO tracking_orders(id,project_id,visitor_id,status,occurred_at,paid_at,attribution_source)
      VALUES(${id},'p',${visitor},${status},'2026-10-01 12:00Z',${status === 'paid' ? '2026-10-01 12:00Z' : null},
      '{"ad_id":"webhook-guess","campaign_id":"webhook-campaign","gateway_fee_in_cents":"10"}')`;
  };
  it('selects only the last pre-confirmation touch, scoped to project, without filling missing fields', async () => {
    await sale('confirmed');
    const [o] = await db`SELECT * FROM tracking_orders WHERE id='confirmed'`;
    expect(o!.attribution_event_id).toBe('last');
    expect(o!.attribution_locked_at).not.toBeNull();
    expect(o!.attribution_source).toEqual({ ad_id: 'last', fbclid: 'last-click', gateway_fee_in_cents: '10' });
  });
  it('freezes empty attribution too, including visitor, across replay/refund/admin repairs', async () => {
    await sale('empty', 'unknown-visitor');
    await db`UPDATE tracking_orders SET attribution_source='{"ad_id":"late"}',visitor_id='v',status='refunded',attribution_locked_at=NULL WHERE id='empty'`;
    const [o] = await db`SELECT * FROM tracking_orders WHERE id='empty'`;
    expect(o!.attribution_source).toEqual({ gateway_fee_in_cents: '10' });
    expect(o!.visitor_id).toBe('unknown-visitor');
    expect(o!.attribution_event_id).toBeNull();
    expect(o!.attribution_locked_at).not.toBeNull();
    expect(o!.status).toBe('refunded');
  });
  it('locks a pending order only on its first approval', async () => {
    await sale('pending', 'v', 'pending');
    const [before] = await db`SELECT attribution_locked_at FROM tracking_orders WHERE id='pending'`;
    expect(before!.attribution_locked_at).toBeNull();
    await db`UPDATE tracking_orders SET status='paid',paid_at='2026-10-01 12:00Z' WHERE id='pending'`;
    await db`UPDATE tracking_orders SET attribution_source='{"ad_id":"replay"}' WHERE id='pending'`;
    const [after] = await db`SELECT * FROM tracking_orders WHERE id='pending'`;
    expect(after!.attribution_source.ad_id).toBe('last');
  });
  it('preserves the snapshot under INSERT ON CONFLICT (webhook replay)', async () => {
    await sale('replayed');
    await db`INSERT INTO tracking_orders(id,project_id,visitor_id,status,occurred_at,paid_at,attribution_source)
      VALUES('replayed','p','unknown','paid','2026-10-02','2026-10-02','{"ad_id":"changed"}')
      ON CONFLICT(id) DO UPDATE SET attribution_source=EXCLUDED.attribution_source,visitor_id=EXCLUDED.visitor_id`;
    const [o] = await db`SELECT * FROM tracking_orders WHERE id='replayed'`;
    expect(o!.attribution_event_id).toBe('last');
    expect(o!.attribution_source.ad_id).toBe('last');
    expect(o!.visitor_id).toBe('v');
  });
  it('does not backfill already confirmed historical orders', async () => {
    const [o] = await db`SELECT * FROM tracking_orders WHERE id='legacy'`;
    expect(o!.attribution_locked_at).toBeNull();
    expect(o!.attribution_source).toEqual({ ad_id: 'legacy' });
    await db`UPDATE tracking_orders SET status='refunded' WHERE id='legacy'`;
    const [after] = await db`SELECT attribution_locked_at FROM tracking_orders WHERE id='legacy'`;
    expect(after!.attribution_locked_at).toBeNull();
  });
  it('keeps a blank last touch blank rather than selecting a more complete earlier one', async () => {
    await db`INSERT INTO tracking_events VALUES('blank-last','p','blank-v','2026-10-01 11:59Z','2026-10-01 11:59Z','Click','{}','{}')`;
    await db`INSERT INTO tracking_events VALUES('filled-first','p','blank-v','2026-10-01 11:00Z','2026-10-01 11:00Z','Click','{"ad_id":"must-not-inherit"}','{}')`;
    await sale('blank-last-sale', 'blank-v');
    const [o] = await db`SELECT * FROM tracking_orders WHERE id='blank-last-sale'`;
    expect(o!.attribution_event_id).toBe('blank-last');
    expect(o!.attribution_source).toEqual({ gateway_fee_in_cents: '10' });
  });
  it('does not accept events received after the approval, even with an earlier client timestamp', async () => {
    await db`INSERT INTO tracking_events VALUES('late-arrival','p','late-v','2026-10-01 12:01Z','2026-10-01 11:59Z','Click','{"ad_id":"late"}','{}')`;
    await sale('late-sale', 'late-v');
    const [o] = await db`SELECT * FROM tracking_orders WHERE id='late-sale'`;
    expect(o!.attribution_event_id).toBeNull();
    expect(o!.attribution_source).toEqual({ gateway_fee_in_cents: '10' });
  });
});

describe('snapshot consumers', () => {
  for (const file of ['workers/meta.worker.ts','workers/tiktok.worker.ts','workers/utmify-delivery.worker.ts','routes/ads-intelligence.ts']) {
    it(`${file} uses the frozen order before live visitor attribution`, async () => {
      const source = await readFile(new URL(`../src/${file}`, import.meta.url), 'utf8');
      expect(source).toContain('o.attribution_locked_at IS NOT NULL');
    });
  }
});
