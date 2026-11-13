CREATE TABLE IF NOT EXISTS traffic_daily_archive (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  day date NOT NULL,
  snapshot jsonb NOT NULL,
  finalized boolean NOT NULL DEFAULT false,
  captured_at timestamptz NOT NULL,
  PRIMARY KEY (company_id, day)
);
