ALTER TABLE tracking_orders
  ADD COLUMN IF NOT EXISTS payment_method text,
  ADD COLUMN IF NOT EXISTS product jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS attribution_source jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE webhook_receipts
  ADD COLUMN IF NOT EXISTS order_id text REFERENCES tracking_orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;

CREATE INDEX IF NOT EXISTS webhook_receipts_connection_received_idx
  ON webhook_receipts(connection_id, received_at DESC);
CREATE INDEX IF NOT EXISTS webhook_receipts_state_idx
  ON webhook_receipts(state, received_at DESC);
