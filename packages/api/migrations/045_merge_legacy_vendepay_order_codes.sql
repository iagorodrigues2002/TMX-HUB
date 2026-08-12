-- Merge emergency imports that used Vendepay's visible eight-character code
-- after the authoritative UUID webhook was subsequently received.
CREATE TEMP TABLE IF NOT EXISTS vendepay_legacy_order_pairs ON COMMIT DROP AS
SELECT legacy.id AS legacy_id, canonical.id AS canonical_id
FROM tracking_orders legacy
JOIN tracking_orders canonical
  ON canonical.project_id=legacy.project_id
 AND canonical.provider=legacy.provider
 AND canonical.external_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
 AND upper(legacy.external_id)=upper(split_part(canonical.external_id,'-',1))
WHERE legacy.provider='vendepay'
  AND legacy.external_id ~* '^[0-9a-f]{8}$'
  AND abs(extract(epoch FROM (legacy.occurred_at-canonical.occurred_at))) <= 300;

UPDATE webhook_receipts receipt
SET order_id=pairs.canonical_id
FROM vendepay_legacy_order_pairs pairs
WHERE receipt.order_id=pairs.legacy_id;

UPDATE recovery_opportunities opportunity
SET recovered_order_id=pairs.canonical_id
FROM vendepay_legacy_order_pairs pairs
WHERE opportunity.recovered_order_id=pairs.legacy_id;

DELETE FROM tracking_orders legacy
USING vendepay_legacy_order_pairs pairs
WHERE legacy.id=pairs.legacy_id;
