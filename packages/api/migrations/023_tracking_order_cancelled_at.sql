ALTER TABLE tracking_orders
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

-- Preserve the best timestamp available for historical cancellations. Future
-- webhook replays no longer move this date because ingestion only fills it
-- once, on the first transition to cancelled.
UPDATE tracking_orders
SET cancelled_at = updated_at
WHERE status = 'cancelled' AND cancelled_at IS NULL;

CREATE INDEX IF NOT EXISTS tracking_orders_project_cancelled_idx
  ON tracking_orders(project_id, cancelled_at DESC)
  WHERE status = 'cancelled';
