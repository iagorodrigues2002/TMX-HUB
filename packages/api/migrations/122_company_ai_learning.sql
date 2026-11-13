CREATE TABLE IF NOT EXISTS company_ai_learning (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  event_id text NOT NULL,
  offer_id text NOT NULL,
  observation jsonb NOT NULL,
  learned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, event_id)
);
