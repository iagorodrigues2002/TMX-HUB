UPDATE tracking_orders
SET order_kind='front',
    paid_at=CASE WHEN status='paid' THEN COALESCE(paid_at,occurred_at) ELSE paid_at END,
    updated_at=now()
WHERE provider='vendepay'
  AND lower(external_id) IN (
    '0248cd05-9da6-4bb2-9159-ad095a004566',
    '09169927-2582-4ff9-8f67-7ba069afc233'
  );
