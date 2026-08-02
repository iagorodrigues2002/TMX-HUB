ALTER TABLE tracking_orders
  ADD COLUMN IF NOT EXISTS refunded_at timestamptz,
  ADD COLUMN IF NOT EXISTS chargeback_at timestamptz;

-- Replays update updated_at even when the financial status did not change.
-- Preserve only historical dates during the migration; today's rows will be
-- populated by an actual lifecycle webhook from now on.
UPDATE tracking_orders
SET refunded_at = updated_at
WHERE status = 'refunded'
  AND refunded_at IS NULL
  AND updated_at < date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
    AT TIME ZONE 'America/Sao_Paulo';

UPDATE tracking_orders
SET chargeback_at = updated_at
WHERE status = 'chargeback'
  AND chargeback_at IS NULL
  AND updated_at < date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
    AT TIME ZONE 'America/Sao_Paulo';

CREATE INDEX IF NOT EXISTS tracking_orders_project_refunded_at_idx
  ON tracking_orders(project_id, refunded_at DESC)
  WHERE refunded_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS tracking_orders_project_chargeback_at_idx
  ON tracking_orders(project_id, chargeback_at DESC)
  WHERE chargeback_at IS NOT NULL;
