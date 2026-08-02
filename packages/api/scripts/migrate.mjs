import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

if (!process.env.DATABASE_URL) {
  console.log('DATABASE_URL ausente; migrations de tracking ignoradas.');
  process.exit(0);
}
const sql = postgres(process.env.DATABASE_URL, {
  max: 1,
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
  // Re-running idempotent DDL used to emit hundreds of "already exists"
  // notices on every boot and could exhaust Railway's deployment log limit.
  onnotice: () => {},
});
const migrations = [
  '001_tracking_foundation.sql',
  '002_meta_capi.sql',
  '003_tracking_advanced.sql',
  '004_tracking_reliable_foundation.sql',
  '005_vendepay_observability.sql',
  '006_tracking_domains_and_redirects.sql',
  '007_vendepay_signing_secret.sql',
  '008_initiate_checkout_deliveries.sql',
  '009_meta_production_replay.sql',
  '010_utmify_web_events.sql',
  '011_utmify_pixel_mapping.sql',
  '012_delivery_evidence.sql',
  '013_tracking_entry_links.sql',
  '014_tracking_product_kinds.sql',
  '015_tracking_orders_brl.sql',
  '016_tracking_pushcut.sql',
  '017_pushcut_devices_repair.sql',
  '018_pushcut_funnel_name.sql',
  '019_pushcut_destination_kind.sql',
  '020_tracking_fee_settings.sql',
  '021_tracking_upsell_tiers.sql',
  '022_tracking_cancelled_delivery_cleanup.sql',
  '023_tracking_order_cancelled_at.sql',
  '024_tracking_abandoned_checkouts.sql',
  '025_tracking_refused_statuses.sql',
  '026_meta_identity_backfill.sql',
  '027_tracking_health_alerts.sql',
  '028_purchase_attribution_repair.sql',
  '029_tmx_recovery.sql',
  '030_recovery_email_analytics.sql',
  '031_tracking_financial_lifecycle.sql',
  '032_utmify_upsell_attribution.sql',
];

await sql`
  CREATE TABLE IF NOT EXISTS app_schema_migrations (
    name text PRIMARY KEY,
    applied_at timestamptz NOT NULL DEFAULT now()
  )
`;

// Databases created before the migration ledger already have migrations
// 001–021 applied. Seed their history instead of replaying the full schema at
// every process start. A fresh database has no tracking_projects table and
// still runs the complete sequence normally.
const [{ legacy_schema: legacySchema }] = await sql`
  SELECT to_regclass('public.tracking_projects') IS NOT NULL AS legacy_schema
`;
if (legacySchema) {
  for (const name of migrations.slice(0, 21)) {
    await sql`
      INSERT INTO app_schema_migrations (name)
      VALUES (${name})
      ON CONFLICT (name) DO NOTHING
    `;
  }
}

for (const name of migrations) {
  const [applied] = await sql`
    SELECT 1 FROM app_schema_migrations WHERE name = ${name}
  `;
  if (applied) continue;

  const migration = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
  await sql.begin(async (tx) => {
    await tx.unsafe(migration);
    await tx`
      INSERT INTO app_schema_migrations (name)
      VALUES (${name})
    `;
  });
  console.log(`Migration ${name} aplicada.`);
}
await sql.end();
