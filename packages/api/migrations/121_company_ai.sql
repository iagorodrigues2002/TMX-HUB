CREATE TABLE IF NOT EXISTS company_ai_settings (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  config jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS company_ai_optimizations (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  event jsonb NOT NULL,
  occurred_at timestamptz NOT NULL,
  PRIMARY KEY(company_id,event_id)
);
