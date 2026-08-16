CREATE TABLE IF NOT EXISTS tracking_upsell_manual_test_results (
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  order_id text NOT NULL REFERENCES tracking_orders(id) ON DELETE CASCADE,
  stage_id text NOT NULL REFERENCES tracking_upsell_stages(id) ON DELETE CASCADE,
  result text NOT NULL CHECK (result IN ('worked', 'failed')),
  checked_by text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (order_id, stage_id)
);

CREATE INDEX IF NOT EXISTS tracking_upsell_manual_test_results_project_idx
  ON tracking_upsell_manual_test_results(project_id, checked_at DESC);
