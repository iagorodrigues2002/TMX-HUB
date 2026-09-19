-- Additive foundation only. No triggers, backfills or changes to existing delivery tables.
CREATE TABLE IF NOT EXISTS tracking_google_ads_destinations (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id),
  name text NOT NULL,
  customer_id text NOT NULL CHECK (customer_id ~ '^[0-9]{10}$'),
  conversion_action_id text NOT NULL CHECK (conversion_action_id ~ '^[0-9]+$'),
  mode text NOT NULL DEFAULT 'server' CHECK (mode = 'server'),
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft', 'archived')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS google_ads_destination_active_identity
  ON tracking_google_ads_destinations(project_id, customer_id, conversion_action_id)
  WHERE state = 'draft';
