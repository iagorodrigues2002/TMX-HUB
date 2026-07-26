CREATE TABLE IF NOT EXISTS tracking_projects (
  id text PRIMARY KEY,
  offer_id text NOT NULL UNIQUE,
  public_key text NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vendepay_connections (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  propagation_param text NOT NULL DEFAULT 'src',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracking_events (
  id text NOT NULL,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  session_id text,
  event_name text NOT NULL,
  event_url text NOT NULL,
  referrer text,
  source jsonb NOT NULL DEFAULT '{}'::jsonb,
  client_ip text,
  user_agent text,
  client_at timestamptz,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, id)
);
CREATE INDEX IF NOT EXISTS tracking_events_project_received_idx
  ON tracking_events(project_id, received_at DESC);
CREATE INDEX IF NOT EXISTS tracking_events_visitor_received_idx
  ON tracking_events(visitor_id, received_at DESC);

CREATE TABLE IF NOT EXISTS webhook_receipts (
  id text PRIMARY KEY,
  connection_id text NOT NULL REFERENCES vendepay_connections(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL,
  diagnostics jsonb NOT NULL DEFAULT '[]'::jsonb,
  received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id, dedupe_key)
);

CREATE TABLE IF NOT EXISTS tracking_orders (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_id text NOT NULL,
  status text NOT NULL,
  amount_minor bigint,
  currency text,
  visitor_id text,
  buyer jsonb NOT NULL DEFAULT '{}'::jsonb,
  raw_status text,
  occurred_at timestamptz NOT NULL,
  paid_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, provider, external_id)
);
CREATE INDEX IF NOT EXISTS tracking_orders_project_occurred_idx
  ON tracking_orders(project_id, occurred_at DESC);
