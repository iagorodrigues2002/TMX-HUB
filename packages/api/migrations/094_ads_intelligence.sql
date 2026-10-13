CREATE TABLE IF NOT EXISTS ads_intelligence_connections (
 owner_id text PRIMARY KEY, dashboard_id text NOT NULL, credentials_encrypted text NOT NULL,
 state text NOT NULL DEFAULT 'ready', next_sync_at timestamptz NOT NULL DEFAULT now(),
 last_sync_at timestamptz, error text, lease_until timestamptz,
 cursor_date date NOT NULL DEFAULT '2026-08-01', range_end date,
 coverage_from date, coverage_to date,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS ads_intelligence_daily (
 owner_id text NOT NULL REFERENCES ads_intelligence_connections(owner_id) ON DELETE CASCADE,
 day date NOT NULL, physical_key text NOT NULL, raw jsonb NOT NULL, currency text,
 updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(owner_id,day,physical_key)
);
CREATE TABLE IF NOT EXISTS ads_intelligence_mappings (
 owner_id text NOT NULL REFERENCES ads_intelligence_connections(owner_id) ON DELETE CASCADE,
 campaign_key text NOT NULL, offer_id text NOT NULL,
 PRIMARY KEY(owner_id,campaign_key)
);
