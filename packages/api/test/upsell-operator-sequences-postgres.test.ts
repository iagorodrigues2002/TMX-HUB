import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { reconcileOperator } from '../scripts/reconcile-upsell-operator.mjs';

const url = process.env.ATTRIBUTION_REPORT_TEST_DATABASE_URL;
describe.skipIf(!url)(
  'operator reopen and automatic funnel sequences (disposable PostgreSQL)',
  () => {
    const schema = `sequence_${randomUUID().replaceAll('-', '')}`;
    const db = postgres(url ?? 'postgres://unused', {
      max: 3,
      connection: { search_path: schema },
      onnotice: () => {},
    });
    beforeAll(async () => {
      if (!['localhost', '127.0.0.1'].includes(new URL(url!).hostname))
        throw Error('Local disposable database required');
      await db.unsafe(`CREATE SCHEMA "${schema}";
      CREATE TABLE tracking_projects(id text PRIMARY KEY);
      CREATE TABLE tracking_orders(id text PRIMARY KEY,project_id text REFERENCES tracking_projects(id) ON DELETE CASCADE,provider text,order_kind text,paid_at timestamptz,status text DEFAULT 'paid',visitor_id text,buyer jsonb DEFAULT '{}',attribution_source jsonb DEFAULT '{}',vendepay_connection_id text,syzepay_connection_id text,amount_minor bigint DEFAULT 3500,amount_brl_minor bigint DEFAULT 3500,currency text DEFAULT 'USD');
      CREATE TABLE tracking_upsell_operator_attempts(id text PRIMARY KEY,project_id text,order_id text,stage_key text,provider text,operator_id text,opened_at timestamptz,view_only boolean DEFAULT false);
      CREATE TABLE webhook_receipts(order_id text,connection_id text,state text,payload jsonb);
      CREATE TABLE syzepay_inbox_receipts(tracking_order_id text,connection_id text,state text,authenticity text);`);
      for (const file of [
        '100_upsell_operator_last_click.sql',
        '119_upsell_operator_sequences.sql',
      ])
        await db.unsafe(await readFile(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    });
    beforeEach(async () => {
      await db.unsafe(
        'TRUNCATE tracking_projects,tracking_orders,tracking_upsell_operator_attempts,tracking_upsell_operator_credits,tracking_upsell_operator_credit_revisions,webhook_receipts,syzepay_inbox_receipts CASCADE',
      );
      await db`INSERT INTO tracking_projects VALUES ('p')`;
      await order('front', 'front', '2026-11-10T10:00:00Z');
    });
    afterAll(async () => {
      if (url) await db.unsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.end();
    });
    const order = async (
      id: string,
      kind: string,
      at: string,
      visitor = 'buyer',
      connection = 'main',
      sql: typeof db = db,
    ) => {
      await sql`INSERT INTO tracking_orders(id,project_id,provider,order_kind,paid_at,visitor_id,vendepay_connection_id) VALUES(${id},'p','vendepay',${kind},${at},${visitor},${connection})`;
    };
    const click = async (
      id: string,
      stage = 'upsell_2',
      at = '2026-11-10T12:00:00Z',
      view = false,
      operator = 'douglas',
      front = 'front',
    ) => {
      await db`INSERT INTO tracking_upsell_operator_attempts(id,project_id,order_id,stage_key,provider,operator_id,opened_at,view_only) VALUES(${id},'p',${front},${stage},'vendepay',${operator},${at},${view})`;
    };
    const proof = async (id: string, test = false, sql: typeof db = db) => {
      await sql`INSERT INTO webhook_receipts SELECT id,vendepay_connection_id,'processed',${sql.json({ status: 'paid', test })} FROM tracking_orders WHERE id=${id}`;
      await sql`SELECT reconcile_upsell_operator_sequences_after_order(${id})`;
    };
    const credit = async (id: string) =>
      (await db`SELECT * FROM tracking_upsell_operator_credits WHERE order_id=${id}`)[0]!;

    it('recovers the screenshot: view-only stage 3 followed by a real new payment', async () => {
      await click('open-2');
      await click('view-3', 'upsell_3', '2026-11-10T12:00:01Z', true);
      await order('up-2', 'upsell_2', '2026-11-10T12:00:10Z');
      await proof('up-2');
      await order('up-3', 'upsell_3', '2026-11-10T12:00:32Z');
      await proof('up-3');
      expect(await credit('up-3')).toMatchObject({
        operator_id: 'douglas',
        attempt_id: 'view-3',
        reason: 'confirmed_reopen',
      });
    });
    it('attributes forward redirection without fabricating a stage click', async () => {
      await click('open-2');
      await order('up-2', 'upsell_2', '2026-11-10T12:00:10Z');
      await proof('up-2');
      await order('up-3', 'upsell_3', '2026-11-10T12:00:32Z');
      await proof('up-3');
      expect(await credit('up-3')).toMatchObject({
        operator_id: 'douglas',
        attempt_id: 'open-2',
        reason: 'same_front_operator_flow',
      });
      expect(
        (await db`SELECT count(*)::int AS n FROM tracking_upsell_operator_attempts`)[0]!.n,
      ).toBe(1);
    });
    it('requires a new real payment; a test receipt never converts a view into an approval', async () => {
      await click('view', 'upsell_3', '2026-11-10T12:00:00Z', true);
      await order('up', 'upsell_3', '2026-11-10T12:00:30Z');
      await proof('up', true);
      expect((await credit('up')).operator_id).toBeNull();
    });
    it('counts a first-stage reopen completed after normal checkout time, without inventing a prior purchase', async () => {
      await click('reopen', 'upsell_1', '2026-11-10T12:00:00Z', true);
      await order('up', 'upsell', '2026-11-10T12:02:22Z');
      await proof('up');
      expect(await credit('up')).toMatchObject({
        operator_id: 'douglas',
        attempt_id: 'reopen',
        reason: 'confirmed_reopen',
      });
    });
    it('does not attribute a later view or an expired checkout session', async () => {
      await click('late', 'upsell_3', '2026-11-10T12:01:00Z', true);
      await order('up', 'upsell_3', '2026-11-10T12:00:30Z');
      await proof('up');
      expect((await credit('up')).operator_id).toBeNull();
      await order('expired', 'upsell_3', '2026-11-10T12:06:01Z');
      await proof('expired');
      expect((await credit('expired')).operator_id).toBeNull();
    });
    it('never transfers an existing direct winner to a different operator', async () => {
      await click('lucas', 'upsell_3', '2026-11-10T11:00:00Z', false, 'lucas');
      await click('view', 'upsell_3', '2026-11-10T12:00:00Z', true);
      await order('up', 'upsell_3', '2026-11-10T12:00:30Z');
      await proof('up');
      expect((await credit('up')).operator_id).toBe('lucas');
    });
    it('leaves competing operators in a forward flow unresolved', async () => {
      await click('douglas');
      await click('lucas', 'upsell_5', '2026-11-10T12:00:01Z', false, 'lucas');
      await order('up', 'upsell_3', '2026-11-10T12:00:30Z');
      await proof('up');
      expect((await credit('up')).operator_id).toBeNull();
    });
    it('never crosses buyers, fronts or gateway accounts', async () => {
      await click('douglas');
      await order('front-other', 'front', '2026-11-10T10:00:00Z', 'other', 'other');
      await order('up', 'upsell_3', '2026-11-10T12:00:30Z', 'other', 'other');
      await proof('up');
      expect((await credit('up')).operator_id).toBeNull();
    });
    it('rejects a reopen before the front payment', async () => {
      await db`UPDATE tracking_orders SET paid_at='2026-11-10T12:00:20Z' WHERE id='front'`;
      await click('early', 'upsell_3', '2026-11-10T12:00:00Z', true);
      await order('up', 'upsell_3', '2026-11-10T12:00:30Z');
      await proof('up');
      expect((await credit('up')).operator_id).toBeNull();
    });
    it('does not inherit a paid sequence after another operator reopens the front', async () => {
      await click('old', 'upsell_2', '2026-11-10T11:00:00Z');
      await order('up-2', 'upsell_2', '2026-11-10T12:00:10Z');
      await proof('up-2');
      await click('other-view', 'upsell_5', '2026-11-10T12:00:20Z', true, 'lucas');
      await order('up-3', 'upsell_3', '2026-11-10T12:00:32Z');
      await proof('up-3');
      expect((await credit('up-3')).operator_id).toBeNull();
    });
    it('keeps the original click date when approval crosses midnight or a month boundary', async () => {
      await db`UPDATE tracking_orders SET paid_at='2026-10-31T23:00:00Z' WHERE id='front'`;
      await click('view', 'upsell_3', '2026-11-01T02:59:30Z', true);
      await order('up', 'upsell_3', '2026-11-01T03:00:10Z');
      await proof('up');
      const row = (
        await db`SELECT to_char(a.opened_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS day FROM tracking_upsell_operator_credits c JOIN tracking_upsell_operator_attempts a ON a.id=c.attempt_id WHERE c.order_id='up'`
      )[0]!;
      expect(row.day).toBe('2026-10-31');
    });
    it('uses a newer confirmed reopen by the same person instead of an older ignored click', async () => {
      await click('old', 'upsell_3', '2026-11-10T11:00:00Z');
      await click('new', 'upsell_3', '2026-11-10T12:00:00Z', true);
      await order('up', 'upsell_3', '2026-11-10T12:00:30Z');
      await proof('up');
      expect(await credit('up')).toMatchObject({
        operator_id: 'douglas',
        attempt_id: 'new',
        reason: 'confirmed_reopen',
      });
      expect(
        (
          await db`SELECT before_credit->>'attempt_id' AS old FROM tracking_upsell_operator_credit_revisions`
        )[0]!.old,
      ).toBe('old');
    });
    it('is repeatable and never rewrites financial orders or creates deliveries', async () => {
      await click('view', 'upsell_3', '2026-11-10T12:00:00Z', true);
      await order('up', 'upsell_3', '2026-11-10T12:00:30Z');
      const before = JSON.stringify(await db`SELECT * FROM tracking_orders ORDER BY id`);
      await proof('up');
      expect(
        (await db`SELECT reconcile_upsell_operator_sequence('up') AS changed`)[0]!.changed,
      ).toBe(false);
      expect(
        (await db`SELECT count(*)::int AS n FROM tracking_upsell_operator_credit_revisions`)[0]!.n,
      ).toBe(1);
      expect(JSON.stringify(await db`SELECT * FROM tracking_orders ORDER BY id`)).toBe(before);
    });
    it('recovers reverse-arriving webhooks through a paid predecessor even with an older source click', async () => {
      await click('old', 'upsell_2', '2026-11-10T11:00:00Z');
      await order('up-3', 'upsell_3', '2026-11-10T12:00:32Z');
      await proof('up-3');
      expect((await credit('up-3')).operator_id).toBeNull();
      await order('up-2', 'upsell_2', '2026-11-10T12:00:10Z');
      await proof('up-2');
      expect(await credit('up-3')).toMatchObject({
        operator_id: 'douglas',
        attempt_id: 'old',
        anchor_order_id: 'up-2',
        reason: 'same_front_paid_sequence',
      });
    });
    it('rolls back the preview, rejects a changed digest, then applies only the reviewed credit repair', async () => {
      await click('view', 'upsell_3', '2026-11-10T12:00:00Z', true);
      await order('historical', 'upsell_3', '2026-11-10T12:00:30Z');
      await proof('historical');
      await db`UPDATE tracking_upsell_operator_credits SET operator_id=NULL,attempt_id=NULL,reason='no_preapproval_click',rule='last_preapproval_click_v1' WHERE order_id='historical'`;
      await db`TRUNCATE tracking_upsell_operator_credit_revisions`;
      const options = { operator: 'douglas', from: '2026-10-01', to: '2026-11-10' };
      const preview = await reconcileOperator(db, options);
      expect(preview.changed).toBe(1);
      expect((await credit('historical')).operator_id).toBeNull();
      expect(
        (await db`SELECT count(*)::int AS n FROM tracking_upsell_operator_credit_revisions`)[0]!.n,
      ).toBe(0);
      await expect(
        reconcileOperator(db, { ...options, apply: true, expectedDigest: '0'.repeat(64) }),
      ).rejects.toThrow('nothing was committed');
      expect((await credit('historical')).operator_id).toBeNull();
      const applied = await reconcileOperator(db, {
        ...options,
        apply: true,
        expectedDigest: preview.digest,
      });
      expect(applied.changed).toBe(1);
      expect((await credit('historical')).operator_id).toBe('douglas');
      expect((await reconcileOperator(db, options)).changed).toBe(0);
    });
    it('serializes overlapping paid callbacks for the same front without losing the continuation', async () => {
      await click('old', 'upsell_2', '2026-11-10T11:00:00Z');
      await Promise.all([
        db.begin(async (tx) => {
          await order(
            'concurrent-2',
            'upsell_2',
            '2026-11-10T12:00:10Z',
            'buyer',
            'main',
            tx as unknown as typeof db,
          );
          await proof('concurrent-2', false, tx as unknown as typeof db);
          await tx`SELECT pg_sleep(0.05)`;
        }),
        db.begin(async (tx) => {
          await order(
            'concurrent-3',
            'upsell_3',
            '2026-11-10T12:00:32Z',
            'buyer',
            'main',
            tx as unknown as typeof db,
          );
          await proof('concurrent-3', false, tx as unknown as typeof db);
        }),
      ]);
      expect((await credit('concurrent-3')).operator_id).toBe('douglas');
    });
  },
);
