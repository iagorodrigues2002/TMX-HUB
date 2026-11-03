import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import postgres from 'postgres';
import { expect, it } from 'vitest';

const migrationName = '114_ads_previous_pageview_index.sql';
const migrationFile = new URL(`../migrations/${migrationName}`, import.meta.url);

it('registers the additive concurrent PageView index after the existing migrations', () => {
  const runner = readFileSync(new URL('../scripts/migrate.mjs', import.meta.url), 'utf8');
  const registered = [...runner.matchAll(/'([0-9]+_[^']+\.sql)'/g)].map((match) => match[1]);
  expect(registered.filter((name) => name === migrationName)).toHaveLength(1);
  expect(registered.indexOf(migrationName)).toBeGreaterThan(
    registered.indexOf('113_company_finance.sql'),
  );
  const migration = readFileSync(migrationFile, 'utf8');
  expect(migration).toMatch(/^\s*--\s*@concurrent\b/);
  expect(migration).toMatch(/CREATE INDEX CONCURRENTLY IF NOT EXISTS/);
});

const databaseUrl =
  process.env.ADS_INDEX_TEST_DATABASE_URL ??
  process.env.REFUNDS_TEST_DATABASE_URL ??
  process.env.TASK_TEST_DATABASE_URL;

it.skipIf(!databaseUrl)(
  'is idempotent on isolated PostgreSQL and preserves latest prior PageView matching',
  async () => {
    const url = new URL(databaseUrl!);
    if (
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !['/qa_refunds', '/tmx_tasks_test'].includes(url.pathname)
    )
      throw new Error('Only a disposable local test database');
    const schema = `ads_pageview_${randomUUID().replaceAll('-', '')}`;
    const db = postgres(url.toString(), {
      max: 1,
      connection: { search_path: schema },
      onnotice: () => {},
    });
    let created = false;
    try {
      await db.unsafe(`CREATE SCHEMA ${schema}`);
      created = true;
      await db`CREATE TABLE tracking_events(id text PRIMARY KEY,project_id text,visitor_id text,session_id text,event_name text,received_at timestamptz,source jsonb)`;
      await db`INSERT INTO tracking_events VALUES
        ('page-a','project','visitor','session','PageView','2026-10-01T12:00:00Z','{"ad_id":"old","campaign_id":"campaign"}'),
        ('page-z','project','visitor','session','PageView','2026-10-01T12:00:00Z','{"ad_id":"latest-tie","campaign_id":"campaign"}'),
        ('foreign-project','other','visitor','session','PageView','2026-10-01T12:02:00Z','{"ad_id":"foreign"}'),
        ('foreign-session','project','visitor','other','PageView','2026-10-01T12:02:00Z','{"ad_id":"other-session"}'),
        ('future','project','visitor','session','PageView','2026-10-01T12:10:00Z','{"ad_id":"future"}'),
        ('not-page','project','visitor','session','Purchase','2026-10-01T12:03:00Z','{"ad_id":"wrong-event"}'),
        ('checkout-session','project','visitor','session','InitiateCheckout','2026-10-01T12:04:00Z','{"ad_id":"checkout-override"}'),
        ('checkout-no-session','project','visitor',NULL,'InitiateCheckout','2026-10-01T12:04:00Z','{}'),
        ('checkout-no-page','project','new-visitor','session','InitiateCheckout','2026-10-01T12:04:00Z','{}')`;
      const matches = () => db`
        SELECT e.id,page.id AS page_id,COALESCE(page.source,'{}'::jsonb)||e.source AS source
        FROM tracking_events e
        LEFT JOIN LATERAL (
          SELECT id,source FROM tracking_events page
          WHERE page.project_id=e.project_id AND page.visitor_id=e.visitor_id
            AND page.event_name='PageView' AND page.received_at<=e.received_at
            AND (e.session_id IS NULL OR page.session_id=e.session_id)
          ORDER BY page.received_at DESC,page.id DESC LIMIT 1
        ) page ON true
        WHERE e.event_name='InitiateCheckout' ORDER BY e.id`;
      const before = await matches();
      expect(before).toEqual([
        { id: 'checkout-no-page', page_id: null, source: {} },
        {
          id: 'checkout-no-session',
          page_id: 'foreign-session',
          source: { ad_id: 'other-session' },
        },
        {
          id: 'checkout-session',
          page_id: 'page-z',
          source: { ad_id: 'checkout-override', campaign_id: 'campaign' },
        },
      ]);
      const migration = readFileSync(migrationFile, 'utf8');
      // Separate statements, deliberately outside a transaction, like the migration runner.
      await db.unsafe(migration);
      await db.unsafe(migration);
      const indexes =
        await db`SELECT i.indisvalid,i.indisready,i.indnkeyatts,pg_get_expr(i.indpred,i.indrelid) AS predicate
        FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
        JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname=${schema} AND c.relname='idx_tracking_events_previous_pageview'`;
      expect(indexes).toHaveLength(1);
      expect(indexes[0]).toMatchObject({ indisvalid: true, indisready: true, indnkeyatts: 4 });
      expect(indexes[0]?.predicate).toContain("event_name = 'PageView'");
      expect(await matches()).toEqual(before);
      const [count] = await db`SELECT count(*)::int AS total FROM tracking_events`;
      expect(count?.total).toBe(9);
    } finally {
      if (created) await db.unsafe(`DROP SCHEMA ${schema} CASCADE`);
      await db.end();
    }
  },
);
