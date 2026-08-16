ALTER TABLE tracking_upsell_identities
  ADD COLUMN IF NOT EXISTS source_order_id text REFERENCES tracking_orders(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS vendepay_connection_id text REFERENCES vendepay_connections(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tracking_upsell_identities_source_order_idx
  ON tracking_upsell_identities(project_id, source_order_id)
  WHERE source_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS tracking_upsell_identities_connection_idx
  ON tracking_upsell_identities(project_id, vendepay_connection_id, last_seen_at DESC);
