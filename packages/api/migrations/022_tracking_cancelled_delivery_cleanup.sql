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

-- Backfill every paid front/upsell transaction for every enabled pixel. The
-- deterministic delivery id keeps this migration idempotent; server startup
-- recovery queues every pending row after migrations finish.
INSERT INTO meta_deliveries AS existing
  (id, project_id, pixel_id, order_id, event_id, event_name, event_at,
   outgoing_event_id, state, attempts, last_error)
SELECT
  md5(mp.id || ':' || o.id || ':purchase'),
  o.project_id,
  mp.id,
  o.id,
  'vendepay:' || o.external_id || ':purchase',
  'Purchase',
  COALESCE(o.paid_at, o.occurred_at),
  NULL,
  'pending',
  0,
  NULL
FROM tracking_orders o
JOIN meta_pixels mp ON mp.project_id = o.project_id AND mp.enabled = true
WHERE o.status = 'paid'
ON CONFLICT (pixel_id, event_id) DO UPDATE SET
  order_id = EXCLUDED.order_id,
  event_name = 'Purchase',
  event_at = EXCLUDED.event_at,
  state = 'pending',
  attempts = 0,
  last_error = NULL
WHERE existing.state <> 'delivered';
