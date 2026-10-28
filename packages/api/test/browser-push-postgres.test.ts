import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';
import { expect, it, vi } from 'vitest';
import { encryptSecret } from '../src/lib/secret-box.js';
vi.mock('../src/env.js', () => ({
  env: {
    WEB_PUSH_PUBLIC_KEY: 'fixture',
    WEB_PUSH_PRIVATE_KEY: 'fixture',
    WEB_PUSH_SUBJECT: 'https://example.com',
    JWT_SECRET: 'isolated-secret',
  },
}));
vi.mock('../src/lib/url-safety.js', () => ({
  assertSafeOutboundUrl: vi.fn().mockResolvedValue(undefined),
}));
import { runBrowserPush } from '../src/services/browser-push.js';

const address = process.env.BROWSER_PUSH_TEST_DATABASE_URL;
it.skipIf(!address)(
  'migration records each future approval once without backfill or surviving rollback',
  async () => {
    const url = new URL(address!);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.pathname !== '/tmx_push_test')
      throw new Error('Disposable local tmx_push_test database required');
    const db = postgres(address!, { max: 1 });
    const schema = `browser_push_test_${randomBytes(6).toString('hex')}`;
    try {
      await db.begin(async (sql) => {
        await sql.unsafe(`CREATE SCHEMA ${schema}`);
        await sql.unsafe(`SET LOCAL search_path TO ${schema}`);
        await sql`CREATE TABLE tracking_projects(id text PRIMARY KEY,offer_id text)`;
        await sql`INSERT INTO tracking_projects VALUES('project','allowed')`;
        await sql`CREATE TABLE tracking_orders(id text PRIMARY KEY,status text,project_id text DEFAULT 'project',occurred_at timestamptz DEFAULT now())`;
        await sql`INSERT INTO tracking_orders(id,status) VALUES('old','paid')`;
        const migration = await readFile(
          new URL('../migrations/104_browser_sale_push.sql', import.meta.url),
          'utf8',
        );
        await sql.unsafe(migration);
        expect(await sql`SELECT * FROM browser_sale_events`).toHaveLength(0);
        await sql`UPDATE tracking_orders SET status='paid' WHERE id='old'`;
        await sql`INSERT INTO tracking_orders(id,status) VALUES('pending','pending'),('direct','paid'),('refunded','refunded')`;
        await sql`UPDATE tracking_orders SET status='paid' WHERE id='pending'`;
        await sql`UPDATE tracking_orders SET status='paid' WHERE id IN ('pending','direct')`;
        expect(
          (await sql`SELECT order_id FROM browser_sale_events ORDER BY order_id`).map(
            (row) => row.order_id,
          ),
        ).toEqual(['direct', 'pending']);
        await sql.unsafe('SAVEPOINT approval_rollback');
        await sql`INSERT INTO tracking_orders(id,status) VALUES('rollback','paid')`;
        await sql.unsafe('ROLLBACK TO SAVEPOINT approval_rollback');
        expect(await sql`SELECT * FROM browser_sale_events WHERE order_id='rollback'`).toHaveLength(
          0,
        );
        await sql.unsafe(migration);
        expect(await sql`SELECT * FROM browser_sale_events`).toHaveLength(2);
        await sql`INSERT INTO browser_push_subscriptions(id,user_id,secret_encrypted) VALUES('device','member','encrypted')`;
        await sql`INSERT INTO browser_push_deliveries(order_id,subscription_id) VALUES('direct','device') ON CONFLICT DO NOTHING`;
        await sql`INSERT INTO browser_push_deliveries(order_id,subscription_id) VALUES('direct','device') ON CONFLICT DO NOTHING`;
        expect(await sql`SELECT * FROM browser_push_deliveries`).toHaveLength(1);
        await sql`DELETE FROM browser_push_subscriptions WHERE id='device'`;
        expect(await sql`SELECT * FROM browser_push_deliveries`).toHaveLength(0);
        const secret = encryptSecret(
          JSON.stringify({
            endpoint: 'https://fcm.googleapis.com/fcm/send/fixture',
            keys: {
              p256dh: Buffer.alloc(65, 4).toString('base64url'),
              auth: Buffer.alloc(16, 1).toString('base64url'),
            },
          }),
          'isolated-secret',
        );
        await sql`INSERT INTO browser_push_subscriptions(id,user_id,secret_encrypted,created_at) VALUES('worker-device','member',${secret},now()-interval '5 seconds')`;
        const send = vi.fn().mockResolvedValue({ statusCode: 201 });
        const app = {
          db: sql,
          userStore: { maybeGetById: async () => ({ id: 'member', role: 'user' }) },
          offerStore: { listAccessible: vi.fn().mockResolvedValue([{ id: 'allowed' }]) },
          log: { warn: vi.fn() },
        };
        await runBrowserPush(app as never, send);
        expect(send).toHaveBeenCalledTimes(2);
        expect(
          await sql`SELECT * FROM browser_push_deliveries WHERE state='delivered'`,
        ).toHaveLength(2);
        await runBrowserPush(app as never, send);
        expect(send).toHaveBeenCalledTimes(2);
        app.offerStore.listAccessible.mockResolvedValue([]);
        await sql`INSERT INTO tracking_orders(id,status) VALUES('revoked','paid')`;
        await runBrowserPush(app as never, send);
        expect(send).toHaveBeenCalledTimes(2);
        expect(
          await sql`SELECT * FROM browser_push_deliveries WHERE order_id='revoked' AND state='skipped'`,
        ).toHaveLength(1);
        await sql.unsafe(`DROP SCHEMA ${schema} CASCADE`);
      });
    } finally {
      await db.end();
    }
  },
);
