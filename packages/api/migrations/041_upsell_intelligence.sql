CREATE TABLE IF NOT EXISTS tracking_upsell_stages (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  stage_key text NOT NULL CHECK (stage_key IN ('upsell_1','upsell_2','upsell_3')),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  destination_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, stage_key)
);

CREATE INDEX IF NOT EXISTS tracking_upsell_stages_project_idx
  ON tracking_upsell_stages(project_id, created_at);

CREATE TABLE IF NOT EXISTS tracking_upsell_identities (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  vendid_hash text NOT NULL,
  vendid_encrypted text NOT NULL,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, vendid_hash)
);

CREATE INDEX IF NOT EXISTS tracking_upsell_identities_visitor_idx
  ON tracking_upsell_identities(project_id, visitor_id);

CREATE TABLE IF NOT EXISTS tracking_upsell_redirects (
  id text PRIMARY KEY,
  stage_id text NOT NULL REFERENCES tracking_upsell_stages(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  journey_id text NOT NULL,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_ip inet,
  user_agent text,
  redirected_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tracking_upsell_redirects_stage_time_idx
  ON tracking_upsell_redirects(stage_id, redirected_at DESC);

CREATE INDEX IF NOT EXISTS tracking_upsell_redirects_visitor_idx
  ON tracking_upsell_redirects(project_id, visitor_id, redirected_at DESC);
