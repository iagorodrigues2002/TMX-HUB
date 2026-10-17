CREATE INDEX IF NOT EXISTS webhook_receipts_processed_order_idx
  ON webhook_receipts(order_id, connection_id, received_at)
  WHERE state='processed' AND order_id IS NOT NULL;
