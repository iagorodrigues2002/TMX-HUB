ALTER TABLE tracking_domains
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'source',
  ADD COLUMN IF NOT EXISTS dns_target text,
  ADD COLUMN IF NOT EXISTS dns_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_domain_id text,
  ADD COLUMN IF NOT EXISTS dns_records jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS tracking_domains_kind_idx
  ON tracking_domains(project_id, kind, enabled);
