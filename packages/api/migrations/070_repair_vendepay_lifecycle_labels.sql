-- VendePay lifecycle notifications may keep a generic completed status while
-- putting the reversal label in `event` or `type` (notably Charge/Reembolso).
-- Repair only orders linked to an immutable receipt; no delivery is replayed.
WITH reversals AS (
  SELECT
    r.order_id,
    max(r.received_at) FILTER (
      WHERE lower(coalesce(r.payload->>'event', '')) IN ('reembolso', 'reembolsado', 'refund', 'refunded')
         OR lower(coalesce(r.payload->>'type', '')) IN ('reembolso', 'reembolsado', 'refund', 'refunded')
    ) AS refunded_at,
    max(r.received_at) FILTER (
      WHERE lower(coalesce(r.payload->>'event', '')) IN ('charge', 'chargeback', 'dispute')
         OR lower(coalesce(r.payload->>'type', '')) IN ('charge', 'chargeback', 'dispute')
    ) AS chargeback_at
  FROM webhook_receipts r
  WHERE r.order_id IS NOT NULL
  GROUP BY r.order_id
)
UPDATE tracking_orders o
SET
  status = CASE
    WHEN r.chargeback_at IS NOT NULL THEN 'chargeback'
    WHEN r.refunded_at IS NOT NULL THEN 'refunded'
    ELSE o.status
  END,
  refunded_at = COALESCE(o.refunded_at, r.refunded_at),
  chargeback_at = COALESCE(o.chargeback_at, r.chargeback_at),
  updated_at = now()
FROM reversals r
WHERE o.id = r.order_id
  AND (r.refunded_at IS NOT NULL OR r.chargeback_at IS NOT NULL);
