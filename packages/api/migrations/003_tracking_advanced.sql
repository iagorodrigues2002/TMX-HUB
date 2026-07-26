CREATE TABLE IF NOT EXISTS tracking_domains (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  hostname text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'pending',
  last_error text,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, hostname)
);

CREATE TABLE IF NOT EXISTS tracking_meta_rules (
  project_id text PRIMARY KEY REFERENCES tracking_projects(id) ON DELETE CASCADE,
  attributed_only boolean NOT NULL DEFAULT true,
  minimum_amount_minor bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracking_gateway_connections (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  provider text NOT NULL,
  propagation_param text NOT NULL DEFAULT 'src',
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, provider)
);

CREATE TABLE IF NOT EXISTS tracking_ab_tests (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('checkout', 'presell')),
  status text NOT NULL DEFAULT 'active',
  traffic_a smallint NOT NULL DEFAULT 50 CHECK (traffic_a BETWEEN 1 AND 99),
  winner_variant_id text,
  winner_locked_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS tracking_ab_one_active_idx
  ON tracking_ab_tests(project_id) WHERE status = 'active' AND deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS tracking_ab_variants (
  id text PRIMARY KEY,
  test_id text NOT NULL REFERENCES tracking_ab_tests(id) ON DELETE CASCADE,
  label text NOT NULL,
  gateway text,
  destination_url text,
  position smallint NOT NULL CHECK (position IN (1, 2)),
  UNIQUE(test_id, position)
);

CREATE TABLE IF NOT EXISTS tracking_ab_assignments (
  id text PRIMARY KEY,
  test_id text NOT NULL REFERENCES tracking_ab_tests(id) ON DELETE CASCADE,
  variant_id text NOT NULL REFERENCES tracking_ab_variants(id) ON DELETE CASCADE,
  visitor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(test_id, visitor_id)
);

CREATE TABLE IF NOT EXISTS vturb_integrations (
  project_id text PRIMARY KEY REFERENCES tracking_projects(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  endpoint_url text,
  token_encrypted text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS vturb_deliveries (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  order_id text NOT NULL REFERENCES tracking_orders(id) ON DELETE CASCADE,
  vturb_id text,
  state text NOT NULL DEFAULT 'waiting',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, order_id)
);

CREATE INDEX IF NOT EXISTS tracking_domains_project_idx ON tracking_domains(project_id);
CREATE INDEX IF NOT EXISTS tracking_ab_tests_project_idx ON tracking_ab_tests(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS vturb_deliveries_project_idx ON vturb_deliveries(project_id, created_at DESC);
