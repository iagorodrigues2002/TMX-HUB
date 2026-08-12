-- Vendepay also emits localized completed states (for example COMPLETO and
-- compra.completa). Older receipts were persisted as unknown and identical
-- webhook retries are intentionally deduplicated, so repair the order itself.
UPDATE tracking_orders
SET status='paid', paid_at=COALESCE(paid_at,occurred_at), updated_at=now()
WHERE provider='vendepay'
  AND status='unknown'
  AND lower(COALESCE(raw_status,'')) ~
      '(^|[._ -])(paid|approved|aprovado|aprovada|complete|completed|completo|completa|concluido|concluida|finalizado|finalizada|success|sucesso)$';

INSERT INTO meta_deliveries(id,project_id,pixel_id,order_id,event_id)
SELECT 'repair-meta-' || md5(mp.id || '|' || o.id),o.project_id,mp.id,o.id,
       'vendepay:' || o.external_id || ':purchase'
FROM tracking_orders o
JOIN meta_pixels mp ON mp.project_id=o.project_id AND mp.enabled=true
WHERE o.provider='vendepay' AND o.status='paid'
ON CONFLICT(pixel_id,event_id) DO NOTHING;

INSERT INTO tracking_delivery_outbox
  (id,project_id,destination_kind,destination_id,order_id,event_id,event_type)
SELECT 'repair-utmify-' || md5(d.id || '|' || o.id),o.project_id,'utmify',d.id,o.id,
       'vendepay:' || o.external_id || ':paid','order.paid'
FROM tracking_orders o
JOIN tracking_utmify_destinations d ON d.project_id=o.project_id AND d.enabled=true
WHERE o.provider='vendepay' AND o.status='paid'
ON CONFLICT(destination_kind,destination_id,event_id) DO NOTHING;
