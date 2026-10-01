-- Generic gateway connections deliberately live beside the legacy VendePay
-- connection. This lets new processors be added without changing an offer's
-- existing VendePay webhook or payment flow.
ALTER TABLE tracking_gateway_connections
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS webhook_token_hash text,
  ADD COLUMN IF NOT EXISTS api_key_encrypted text,
  ADD COLUMN IF NOT EXISTS signing_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_webhook_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

UPDATE tracking_gateway_connections
SET name = COALESCE(NULLIF(name, ''), initcap(provider))
WHERE name IS NULL OR name = '';

ALTER TABLE tracking_gateway_connections
  ALTER COLUMN name SET NOT NULL;
ALTER TABLE tracking_gateway_connections
  ALTER COLUMN name SET DEFAULT 'Gateway';

CREATE UNIQUE INDEX IF NOT EXISTS tracking_gateway_connections_webhook_token_idx
  ON tracking_gateway_connections(webhook_token_hash)
  WHERE webhook_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS tracking_gateway_webhook_receipts (
  id text PRIMARY KEY,
  gateway_connection_id text NOT NULL REFERENCES tracking_gateway_connections(id) ON DELETE CASCADE,
  dedupe_key text NOT NULL,
  payload jsonb NOT NULL,
  state text NOT NULL,
  diagnostics jsonb NOT NULL DEFAULT '[]'::jsonb,
  order_id text REFERENCES tracking_orders(id) ON DELETE SET NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE(gateway_connection_id, dedupe_key)
);
CREATE INDEX IF NOT EXISTS tracking_gateway_receipts_connection_received_idx
  ON tracking_gateway_webhook_receipts(gateway_connection_id, received_at DESC);

ALTER TABLE tracking_orders
  ADD COLUMN IF NOT EXISTS gateway_connection_id text
  REFERENCES tracking_gateway_connections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS tracking_orders_gateway_connection_idx
  ON tracking_orders(gateway_connection_id);
