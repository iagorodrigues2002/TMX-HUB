-- Feed every enabled pixel with historical Purchase events that have buyer
-- identity. Keeping the same event_id lets Meta deduplicate previous sends
-- while receiving the richer user_data (email/phone hashes).
INSERT INTO meta_deliveries AS existing
  (id, project_id, pixel_id, order_id, event_id, event_name, event_at,
   outgoing_event_id, state, attempts, last_error)
SELECT
  md5(mp.id || ':' || o.id || ':identity-purchase'),
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
  AND (
    NULLIF(o.buyer->>'email', '') IS NOT NULL
    OR NULLIF(o.buyer->>'phone', '') IS NOT NULL
  )
ON CONFLICT (pixel_id, event_id) DO UPDATE SET
  order_id = EXCLUDED.order_id,
  event_name = 'Purchase',
  event_at = EXCLUDED.event_at,
  state = 'pending',
  attempts = 0,
  last_error = NULL;

-- ICs only receive an identity belonging to the same visitor. This includes
-- data sent on the IC itself or through an earlier tmx.identify() event.
INSERT INTO meta_deliveries AS existing
  (id, project_id, pixel_id, order_id, event_id, event_name, event_at,
   outgoing_event_id, state, attempts, last_error)
SELECT
  md5(mp.id || ':' || ic.id || ':identity-ic'),
  ic.project_id,
  mp.id,
  NULL,
  ic.id,
  'InitiateCheckout',
  ic.received_at,
  NULL,
  'pending',
  0,
  NULL
FROM tracking_events ic
JOIN meta_pixels mp ON mp.project_id = ic.project_id AND mp.enabled = true
WHERE ic.event_name = 'InitiateCheckout'
  AND (
    NULLIF(ic.properties->>'email', '') IS NOT NULL
    OR NULLIF(ic.properties->>'phone', '') IS NOT NULL
    OR EXISTS (
      SELECT 1
      FROM tracking_events identity_event
      WHERE identity_event.project_id = ic.project_id
        AND identity_event.visitor_id = ic.visitor_id
        AND identity_event.received_at <= ic.received_at
        AND (
          NULLIF(identity_event.properties->>'email', '') IS NOT NULL
          OR NULLIF(identity_event.properties->>'phone', '') IS NOT NULL
        )
    )
  )
ON CONFLICT (pixel_id, event_id) DO UPDATE SET
  event_name = 'InitiateCheckout',
  event_at = EXCLUDED.event_at,
  state = 'pending',
  attempts = 0,
  last_error = NULL;
