-- Explodely uses a global receiver and resolves the tenant from vendor/seller
-- identifiers inside the payload. Receipts therefore have to exist before a
-- gateway connection is known. Existing VendePay/Paysight rows are untouched.
ALTER TABLE webhook_receipts
  ALTER COLUMN connection_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS gateway_connection_id text
    REFERENCES tracking_gateway_connections(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gateway text,
  ADD COLUMN IF NOT EXISTS transaction_id text,
  ADD COLUMN IF NOT EXISTS raw_payload text,
  ADD COLUMN IF NOT EXISTS content_type text;

ALTER TABLE tracking_gateway_webhook_receipts
  ALTER COLUMN gateway_connection_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS gateway text,
  ADD COLUMN IF NOT EXISTS transaction_id text,
  ADD COLUMN IF NOT EXISTS raw_payload text,
  ADD COLUMN IF NOT EXISTS content_type text;

UPDATE tracking_gateway_webhook_receipts receipt
SET gateway = connection.provider,
    transaction_id = COALESCE(receipt.transaction_id, receipt.dedupe_key)
FROM tracking_gateway_connections connection
WHERE connection.id = receipt.gateway_connection_id
  AND (receipt.gateway IS NULL OR receipt.transaction_id IS NULL);

CREATE UNIQUE INDEX IF NOT EXISTS webhook_receipts_gateway_transaction_idx
  ON webhook_receipts(gateway, transaction_id)
  WHERE gateway IS NOT NULL AND transaction_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tracking_gateway_receipts_gateway_transaction_idx
  ON tracking_gateway_webhook_receipts(gateway, transaction_id)
  WHERE gateway IS NOT NULL AND transaction_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tracking_gateway_connections_explodely_vendor_idx
  ON tracking_gateway_connections(provider, (settings->>'vendor_id'))
  WHERE provider = 'explodely' AND enabled = true;

CREATE INDEX IF NOT EXISTS tracking_gateway_connections_explodely_seller_idx
  ON tracking_gateway_connections(provider, (settings->>'seller_id'))
  WHERE provider = 'explodely' AND enabled = true;
