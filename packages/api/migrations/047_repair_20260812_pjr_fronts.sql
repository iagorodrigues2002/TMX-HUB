-- Authoritative Iago replays for the two PJR front purchases received during
-- the 2026-08-12 incident. Their payloads omitted the product UUID, leaving
-- the otherwise-paid orders unclassified.
UPDATE tracking_orders
SET order_kind='front', updated_at=now()
WHERE provider='vendepay'
  AND external_id IN (
    '0248cd05-9da6-4bb2-9159-ad095a004566',
    '09169927-2582-4ff9-8f67-7ba069afc233'
  )
  AND paid_at IS NOT NULL;
