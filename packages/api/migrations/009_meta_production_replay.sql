ALTER TABLE meta_deliveries
  ADD COLUMN IF NOT EXISTS outgoing_event_id text;
