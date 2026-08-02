-- Recover the visitor for recent paid orders when Vendepay omitted src but the
-- buyer identified themselves earlier in the same tracked journey.
WITH matches AS (
  SELECT o.id AS order_id, identity_event.visitor_id
  FROM tracking_orders o
  JOIN LATERAL (
    SELECT e.visitor_id
    FROM tracking_events e
    WHERE e.project_id = o.project_id
      AND e.received_at BETWEEN o.occurred_at - interval '30 days' AND o.occurred_at + interval '1 day'
      AND (
        (NULLIF(lower(o.buyer->>'email'), '') IS NOT NULL
          AND lower(e.properties->>'email') = lower(o.buyer->>'email'))
        OR
        (NULLIF(regexp_replace(o.buyer->>'phone', '\D', '', 'g'), '') IS NOT NULL
          AND regexp_replace(e.properties->>'phone', '\D', '', 'g') = regexp_replace(o.buyer->>'phone', '\D', '', 'g'))
      )
    ORDER BY abs(extract(epoch FROM (o.occurred_at - e.received_at))), e.received_at DESC
    LIMIT 1
  ) identity_event ON true
  WHERE o.status = 'paid' AND NULLIF(trim(o.visitor_id), '') IS NULL
    AND o.occurred_at >= now() - interval '30 days'
)
UPDATE tracking_orders o SET visitor_id = matches.visitor_id, updated_at = now()
FROM matches WHERE o.id = matches.order_id;

-- Persist the consolidated first/last touch on the order. The order then keeps
-- its attribution even after the visitor retention window expires.
UPDATE tracking_orders o
SET attribution_source = COALESCE(o.attribution_source, '{}'::jsonb) ||
    COALESCE(v.first_source, '{}'::jsonb) || COALESCE(v.last_source, '{}'::jsonb),
    updated_at = now()
FROM tracking_visitors v
WHERE o.project_id = v.project_id AND o.visitor_id = v.visitor_id
  AND o.status = 'paid' AND o.occurred_at >= now() - interval '30 days';

-- Re-send with the original event_id. Meta deduplicates the Purchase while
-- receiving the richer identity/attribution payload.
UPDATE meta_deliveries md
SET state = 'pending', attempts = 0, last_error = NULL
FROM tracking_orders o
WHERE md.order_id = o.id AND md.event_name = 'Purchase'
  AND o.status = 'paid' AND o.occurred_at >= now() - interval '30 days';
