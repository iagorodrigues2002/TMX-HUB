-- UTMify does not accept a cancelled status. Keep these lifecycle events in
-- TMX, but do not leave impossible deliveries permanently pending.
UPDATE tracking_delivery_outbox d
SET state = 'skipped',
    last_error = 'Status cancelled não é aceito pela UTMify; evento mantido apenas no TMX.',
    next_attempt_at = now()
FROM tracking_orders o
WHERE d.order_id = o.id
  AND d.destination_kind = 'utmify'
  AND o.status = 'cancelled'
  AND d.state IN ('pending', 'failed', 'processing', 'dead');
