CREATE TABLE IF NOT EXISTS recovery_test_runs (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  recipient text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  destination_url text NOT NULL,
  provider_message_id text,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','sent','failed')),
  sent_at timestamptz,
  clicked_at timestamptz,
  checkout_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS recovery_test_runs_project_idx ON recovery_test_runs(project_id, created_at DESC);
