CREATE TABLE IF NOT EXISTS company_spy_visual_analyses (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  offer_id uuid NOT NULL,
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS company_spy_visual_offer ON company_spy_visual_analyses(company_id, offer_id);
