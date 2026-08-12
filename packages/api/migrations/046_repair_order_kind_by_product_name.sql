-- Replayed Vendepay payloads may omit the product UUID. Recover the order
-- kind from an exact product-name match already classified in the same offer.
WITH matches AS (
  SELECT target.id,
    (SELECT known.order_kind
     FROM tracking_orders known
     WHERE known.project_id=target.project_id
       AND known.order_kind <> 'unknown'
       AND NULLIF(lower(trim(known.product->>'name')),'') =
           NULLIF(lower(trim(target.product->>'name')),'')
     ORDER BY known.updated_at DESC
     LIMIT 1) AS inferred_kind
  FROM tracking_orders target
  WHERE target.order_kind='unknown'
)
UPDATE tracking_orders target
SET order_kind=matches.inferred_kind, updated_at=now()
FROM matches
WHERE target.id=matches.id AND matches.inferred_kind IS NOT NULL;
