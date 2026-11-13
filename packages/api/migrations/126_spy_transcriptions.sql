CREATE TABLE IF NOT EXISTS company_spy_transcriptions (
  company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fingerprint text NOT NULL CHECK (fingerprint ~ '^[a-f0-9]{64}$'),
  record jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, fingerprint)
);
