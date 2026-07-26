CREATE TABLE IF NOT EXISTS meta_pixels (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  pixel_id text NOT NULL,
  access_token_encrypted text NOT NULL,
  test_event_code text,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, pixel_id)
);

CREATE TABLE IF NOT EXISTS meta_deliveries (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  pixel_id text NOT NULL REFERENCES meta_pixels(id) ON DELETE CASCADE,
  order_id text NOT NULL REFERENCES tracking_orders(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  state text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  response jsonb,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE(pixel_id, event_id)
);
CREATE INDEX IF NOT EXISTS meta_deliveries_project_created_idx
  ON meta_deliveries(project_id, created_at DESC);
