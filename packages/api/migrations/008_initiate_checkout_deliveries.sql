ALTER TABLE meta_deliveries
  ALTER COLUMN order_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS event_name text NOT NULL DEFAULT 'Purchase',
  ADD COLUMN IF NOT EXISTS event_at timestamptz;

ALTER TABLE tracking_delivery_outbox
  ALTER COLUMN order_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS meta_deliveries_event_name_created_idx
  ON meta_deliveries(project_id, event_name, created_at DESC);
