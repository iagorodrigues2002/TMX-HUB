-- LGPD foundation: make time-based event purges efficient and retain the
-- visitor's explicit consent decision independently of ephemeral sessions.

CREATE INDEX IF NOT EXISTS tracking_events_received_at_idx
  ON tracking_events(received_at);

CREATE TABLE IF NOT EXISTS tracking_consents (
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  state text NOT NULL CHECK (state IN ('granted', 'denied')),
  consent_version text NOT NULL,
  purposes text[] NOT NULL DEFAULT '{}',
  consented_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, visitor_id)
);

CREATE INDEX IF NOT EXISTS tracking_consents_updated_at_idx
  ON tracking_consents(updated_at DESC);
