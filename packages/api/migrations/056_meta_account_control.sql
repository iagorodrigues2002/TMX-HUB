CREATE TABLE IF NOT EXISTS meta_marketing_connections (
  id text PRIMARY KEY,
  name text NOT NULL,
  app_id text NOT NULL,
  app_secret_encrypted text NOT NULL,
  access_token_encrypted text NOT NULL,
  token_type text,
  token_expires_at timestamptz,
  enabled boolean NOT NULL DEFAULT true,
  last_sync_at timestamptz,
  last_sync_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_ad_accounts (
  id text PRIMARY KEY,
  connection_id text NOT NULL REFERENCES meta_marketing_connections(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL,
  business_id text,
  business_name text,
  account_status integer NOT NULL,
  disable_reason integer NOT NULL DEFAULT 0,
  currency text NOT NULL,
  timezone_name text,
  amount_spent_minor bigint NOT NULL DEFAULT 0,
  balance_minor bigint NOT NULL DEFAULT 0,
  spend_cap_minor bigint NOT NULL DEFAULT 0,
  primary_offer_id text,
  created_time timestamptz,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id, external_id)
);
CREATE INDEX IF NOT EXISTS meta_ad_accounts_status_idx
  ON meta_ad_accounts(account_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS meta_ad_accounts_offer_idx
  ON meta_ad_accounts(primary_offer_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS meta_ad_campaigns (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES meta_ad_accounts(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL,
  configured_status text,
  effective_status text,
  objective text,
  daily_budget_minor bigint,
  lifetime_budget_minor bigint,
  offer_id text,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, external_id)
);
CREATE INDEX IF NOT EXISTS meta_ad_campaigns_offer_idx
  ON meta_ad_campaigns(offer_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS meta_ad_account_snapshots (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES meta_ad_accounts(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  amount_spent_minor bigint NOT NULL DEFAULT 0,
  balance_minor bigint NOT NULL DEFAULT 0,
  spend_30d_minor bigint NOT NULL DEFAULT 0,
  impressions_30d bigint NOT NULL DEFAULT 0,
  reach_30d bigint NOT NULL DEFAULT 0,
  clicks_30d bigint NOT NULL DEFAULT 0,
  link_clicks_30d bigint NOT NULL DEFAULT 0,
  purchases_30d numeric NOT NULL DEFAULT 0,
  purchase_value_30d numeric NOT NULL DEFAULT 0,
  campaigns_total integer NOT NULL DEFAULT 0,
  campaigns_active integer NOT NULL DEFAULT 0,
  captured_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(account_id, snapshot_date)
);
CREATE INDEX IF NOT EXISTS meta_ad_account_snapshots_date_idx
  ON meta_ad_account_snapshots(snapshot_date DESC, account_id);

CREATE TABLE IF NOT EXISTS meta_account_offer_history (
  id text PRIMARY KEY,
  account_id text NOT NULL REFERENCES meta_ad_accounts(id) ON DELETE CASCADE,
  campaign_id text REFERENCES meta_ad_campaigns(id) ON DELETE CASCADE,
  offer_id text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS meta_account_offer_history_lookup_idx
  ON meta_account_offer_history(account_id, campaign_id, started_at DESC);
