-- Vendepay emits carrinho.abandonado for checkouts that never became sales.
-- They are useful funnel signals, but must not inflate cancelled sales.
UPDATE tracking_orders
SET status = 'abandoned',
    cancelled_at = NULL,
    updated_at = now()
WHERE status = 'cancelled'
  AND lower(COALESCE(raw_status, '')) IN (
    'carrinho.abandonado',
    'carrinho_abandonado',
    'abandonado'
  );

CREATE INDEX IF NOT EXISTS tracking_orders_project_abandoned_idx
  ON tracking_orders(project_id, occurred_at DESC)
  WHERE status = 'abandoned';
