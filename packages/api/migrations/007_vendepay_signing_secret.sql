ALTER TABLE vendepay_connections
  ADD COLUMN IF NOT EXISTS signing_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS signing_secret_updated_at timestamptz;
