ALTER TABLE tracking_events
  ADD COLUMN IF NOT EXISTS journey_id text,
  ADD COLUMN IF NOT EXISTS event_category text NOT NULL DEFAULT 'behavior',
  ADD COLUMN IF NOT EXISTS page_title text,
  ADD COLUMN IF NOT EXISTS properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS consent_state text;

CREATE TABLE IF NOT EXISTS tracking_visitors (
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  first_source jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_source jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, visitor_id)
);

CREATE TABLE IF NOT EXISTS tracking_sessions (
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  session_id text NOT NULL,
  visitor_id text NOT NULL,
  journey_id text,
  landing_url text NOT NULL,
  referrer text,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, session_id)
);

CREATE TABLE IF NOT EXISTS tracking_utmify_destinations (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'UTMify',
  api_token_encrypted text NOT NULL,
  endpoint_url text NOT NULL DEFAULT 'https://api.utmify.com.br/api-credentials/orders',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id)
);

CREATE TABLE IF NOT EXISTS tracking_delivery_outbox (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  destination_kind text NOT NULL CHECK (destination_kind IN ('utmify')),
  destination_id text NOT NULL,
  order_id text NOT NULL REFERENCES tracking_orders(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_type text NOT NULL,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'processing', 'delivered', 'failed', 'dead')),
  attempts integer NOT NULL DEFAULT 0,
  response_status integer,
  response jsonb,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE(destination_kind, destination_id, event_id)
);

CREATE INDEX IF NOT EXISTS tracking_events_journey_received_idx
  ON tracking_events(project_id, journey_id, received_at DESC);
CREATE INDEX IF NOT EXISTS tracking_sessions_visitor_idx
  ON tracking_sessions(project_id, visitor_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS tracking_outbox_pending_idx
  ON tracking_delivery_outbox(state, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS tracking_outbox_project_idx
  ON tracking_delivery_outbox(project_id, created_at DESC);
