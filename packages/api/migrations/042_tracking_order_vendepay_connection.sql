ALTER TABLE tracking_orders
  ADD COLUMN IF NOT EXISTS vendepay_connection_id text
  REFERENCES vendepay_connections(id) ON DELETE SET NULL;

UPDATE tracking_orders o
SET vendepay_connection_id = source.connection_id
FROM (
  SELECT DISTINCT ON (order_id) order_id, connection_id
  FROM webhook_receipts
  WHERE order_id IS NOT NULL
  ORDER BY order_id, received_at DESC
) source
WHERE o.id = source.order_id AND o.vendepay_connection_id IS NULL;

CREATE INDEX IF NOT EXISTS tracking_orders_vendepay_connection_idx
  ON tracking_orders(vendepay_connection_id);
