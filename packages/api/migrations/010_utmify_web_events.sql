CREATE TABLE IF NOT EXISTS tracking_utmify_web_events (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  pixel_id text NOT NULL REFERENCES meta_pixels(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_name text NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'processing', 'delivered', 'failed', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  response_status integer,
  response jsonb,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE(pixel_id, event_id)
);

CREATE INDEX IF NOT EXISTS tracking_utmify_web_events_pending_idx
  ON tracking_utmify_web_events(state, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS tracking_utmify_web_events_project_idx
  ON tracking_utmify_web_events(project_id, created_at DESC);
