CREATE TABLE IF NOT EXISTS tracking_health_alerts (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  alert_key text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
  title text NOT NULL,
  detail text NOT NULL,
  metric text,
  current_value numeric,
  threshold_value numeric,
  state text NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'acknowledged', 'resolved')),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  resolved_at timestamptz,
  UNIQUE(project_id, alert_key)
);

CREATE INDEX IF NOT EXISTS tracking_health_alerts_project_state_idx
  ON tracking_health_alerts(project_id, state, last_seen_at DESC);
