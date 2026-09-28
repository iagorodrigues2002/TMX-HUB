-- TikTok Events API destinations are deliberately independent from Meta and
-- Google. One offer may safely fan out the same approved front purchase to
-- several TikTok pixels without sharing credentials between them.
CREATE TABLE IF NOT EXISTS tracking_tiktok_destinations (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  pixel_code text NOT NULL,
  access_token_encrypted text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, pixel_code)
);

CREATE TABLE IF NOT EXISTS tracking_tiktok_deliveries (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  destination_id text NOT NULL REFERENCES tracking_tiktok_destinations(id) ON DELETE CASCADE,
  order_id text REFERENCES tracking_orders(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event_name text NOT NULL DEFAULT 'Purchase',
  test_event_code text,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','delivered','failed','dead','test')),
  attempts integer NOT NULL DEFAULT 0,
  response_status integer,
  response jsonb,
  last_error text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz,
  UNIQUE(destination_id, event_id)
);
CREATE INDEX IF NOT EXISTS tracking_tiktok_deliveries_pending_idx
  ON tracking_tiktok_deliveries(state, next_attempt_at, created_at);
CREATE INDEX IF NOT EXISTS tracking_tiktok_deliveries_project_idx
  ON tracking_tiktok_deliveries(project_id, created_at DESC);
