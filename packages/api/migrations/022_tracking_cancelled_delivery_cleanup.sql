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

-- A paid transaction must reach Meta even when the browser identity could not
-- be recovered. Attribution quality remains visible in the audit screen, but
-- it no longer suppresses real revenue events.
UPDATE tracking_meta_rules
SET attributed_only = false, updated_at = now()
WHERE attributed_only = true;

-- Historical purchases are reconciled by the authenticated admin endpoint.
-- Migrations run on every process start in this service, so a data backfill
-- here would repeatedly reset deliveries and can prevent the API from booting
-- when a provider sent duplicate external order identifiers.
