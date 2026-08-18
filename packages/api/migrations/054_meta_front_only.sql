UPDATE meta_deliveries delivery
SET state='skipped',
    last_error='Upsell bloqueado: somente compras front são enviadas aos pixels Meta.'
FROM tracking_orders orders
WHERE delivery.order_id=orders.id
  AND delivery.event_name='Purchase'
  AND orders.order_kind<>'front'
  AND delivery.state<>'delivered';
