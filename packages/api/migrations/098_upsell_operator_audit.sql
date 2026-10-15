-- Append-only operational audit. No buyer data, checkout URLs or provider secrets.
CREATE TABLE IF NOT EXISTS tracking_upsell_operator_attempts (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  -- Keep operational history if an order is merged or a configured stage removed.
  order_id text NOT NULL,
  stage_id text NOT NULL,
  stage_key text NOT NULL,
  provider text NOT NULL,
  operator_id text NOT NULL,
  click_id text NOT NULL,
  opened_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, operator_id, click_id)
);
CREATE INDEX IF NOT EXISTS tracking_upsell_operator_attempts_project_time_idx
  ON tracking_upsell_operator_attempts(project_id, opened_at DESC, id);
CREATE INDEX IF NOT EXISTS tracking_upsell_operator_attempts_operator_time_idx
  ON tracking_upsell_operator_attempts(project_id, operator_id, opened_at DESC, id);
