-- Upsell webhooks often omit src and UTMs. Recover the campaign from the
-- closest paid front order for the same exact buyer within the prior 30 days.
WITH inherited AS (
  SELECT upsell.id,
         COALESCE(upsell.visitor_id, front.visitor_id) AS visitor_id,
         front.attribution_source || upsell.attribution_source AS attribution_source
  FROM tracking_orders upsell
  JOIN LATERAL (
    SELECT f.visitor_id, f.attribution_source
    FROM tracking_orders f
    WHERE f.project_id = upsell.project_id
      AND f.status = 'paid'
      AND f.order_kind = 'front'
      AND f.occurred_at <= upsell.occurred_at
      AND f.occurred_at >= upsell.occurred_at - interval '30 days'
      AND (
        (NULLIF(upsell.buyer->>'email','') IS NOT NULL
          AND lower(f.buyer->>'email') = lower(upsell.buyer->>'email'))
        OR
        (NULLIF(regexp_replace(upsell.buyer->>'phone','\D','','g'),'') IS NOT NULL
          AND regexp_replace(f.buyer->>'phone','\D','','g') =
              regexp_replace(upsell.buyer->>'phone','\D','','g'))
      )
    ORDER BY f.occurred_at DESC
    LIMIT 1
  ) front ON true
  WHERE upsell.status = 'paid'
    AND upsell.order_kind IN ('upsell','upsell_2')
    AND upsell.occurred_at >= now() - interval '30 days'
)
UPDATE tracking_orders o
SET visitor_id = inherited.visitor_id,
    attribution_source = inherited.attribution_source,
    updated_at = now()
FROM inherited
WHERE o.id = inherited.id;

-- Guarantee one UTMify sale delivery per destination for every paid upsell.
INSERT INTO tracking_delivery_outbox
  (id, project_id, destination_kind, destination_id, order_id, event_id, event_type, state)
SELECT
  'U' || upper(substr(md5('utmify-upsell:' || o.id || ':' || u.id), 1, 25)),
  o.project_id, 'utmify', u.id, o.id,
  'vendepay:' || o.external_id || ':paid', 'order.paid', 'pending'
FROM tracking_orders o
JOIN tracking_utmify_destinations u ON u.project_id=o.project_id AND u.enabled=true
WHERE o.status='paid'
  AND o.order_kind IN ('upsell','upsell_2')
  AND o.occurred_at >= now() - interval '30 days'
ON CONFLICT (destination_kind, destination_id, event_id) DO NOTHING;

-- Re-send attributed recent upsells with a fresh idempotency attempt so the
-- UTMify campaign report receives the inherited campaign/ad identifiers.
UPDATE tracking_delivery_outbox d
SET state='pending', last_error=NULL, next_attempt_at=now()
FROM tracking_orders o
WHERE d.order_id=o.id
  AND d.destination_kind='utmify'
  AND o.status='paid'
  AND o.order_kind IN ('upsell','upsell_2')
  AND o.occurred_at >= now() - interval '30 days'
  AND (
    NULLIF(o.attribution_source->>'campaign_id','') IS NOT NULL
    OR NULLIF(o.attribution_source->>'utm_campaign','') IS NOT NULL
  );
