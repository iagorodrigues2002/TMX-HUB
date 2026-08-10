ALTER TABLE vendepay_connections
  ADD COLUMN IF NOT EXISTS name text;

UPDATE vendepay_connections
SET name = 'Conta Vendepay'
WHERE name IS NULL OR trim(name) = '';

ALTER TABLE vendepay_connections
  ALTER COLUMN name SET DEFAULT 'Conta Vendepay',
  ALTER COLUMN name SET NOT NULL;

CREATE INDEX IF NOT EXISTS vendepay_connections_project_created_idx
  ON vendepay_connections(project_id, created_at DESC);
