ALTER TABLE syzepay_inbox_receipts ADD COLUMN IF NOT EXISTS dedupe_key text;
ALTER TABLE syzepay_inbox_receipts ADD COLUMN IF NOT EXISTS event_id text;
ALTER TABLE syzepay_inbox_receipts ADD COLUMN IF NOT EXISTS order_id text;
UPDATE syzepay_inbox_receipts SET dedupe_key='body:'||body_hash WHERE dedupe_key IS NULL;
ALTER TABLE syzepay_inbox_receipts ALTER COLUMN dedupe_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS syzepay_inbox_dedupe_idx ON syzepay_inbox_receipts(connection_id,dedupe_key);
ALTER TABLE syzepay_inbox_receipts DROP CONSTRAINT IF EXISTS syzepay_inbox_receipts_connection_id_body_hash_key;
