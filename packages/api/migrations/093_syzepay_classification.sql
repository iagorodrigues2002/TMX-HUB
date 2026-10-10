ALTER TABLE syzepay_company_connections ADD COLUMN IF NOT EXISTS signing_secret_encrypted text;
ALTER TABLE syzepay_inbox_receipts DROP CONSTRAINT IF EXISTS syzepay_inbox_receipts_state_check;
ALTER TABLE syzepay_inbox_receipts ADD CONSTRAINT syzepay_inbox_receipts_state_check CHECK(state IN ('awaiting_mapping','processed','ignored','quarantined'));
ALTER TABLE syzepay_inbox_receipts DROP CONSTRAINT IF EXISTS syzepay_inbox_receipts_authenticity_check;
ALTER TABLE syzepay_inbox_receipts ADD CONSTRAINT syzepay_inbox_receipts_authenticity_check CHECK(authenticity IN ('token_only','signature_verified'));
ALTER TABLE syzepay_inbox_receipts ADD COLUMN IF NOT EXISTS tracking_order_id text REFERENCES tracking_orders(id);
ALTER TABLE syzepay_inbox_receipts ADD COLUMN IF NOT EXISTS processed_at timestamptz;
ALTER TABLE tracking_orders ADD COLUMN IF NOT EXISTS syzepay_connection_id text REFERENCES syzepay_company_connections(id);
CREATE TABLE IF NOT EXISTS syzepay_order_mappings (
  connection_id text NOT NULL REFERENCES syzepay_company_connections(id),
  external_order_id text NOT NULL,
  project_id text NOT NULL REFERENCES tracking_projects(id),
  order_kind text NOT NULL CHECK(order_kind='front' OR order_kind='upsell' OR order_kind ~ '^upsell_[0-9]+$'),
  actor_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(connection_id,external_order_id)
);
