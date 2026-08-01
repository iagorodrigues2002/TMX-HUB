-- Normalize Portuguese Vendepay failure labels/events that older ingestion
-- stored as unknown (for example Falha, Recusada and compra.recusada).
UPDATE tracking_orders
SET status = 'refused', updated_at = now()
WHERE status = 'unknown'
  AND (
    lower(COALESCE(raw_status, '')) LIKE '%recusad%'
    OR lower(COALESCE(raw_status, '')) LIKE '%falh%'
    OR lower(COALESCE(raw_status, '')) LIKE '%failed%'
    OR lower(COALESCE(raw_status, '')) LIKE '%declined%'
  );

CREATE INDEX IF NOT EXISTS tracking_orders_project_refused_idx
  ON tracking_orders(project_id, occurred_at DESC)
  WHERE status = 'refused';
