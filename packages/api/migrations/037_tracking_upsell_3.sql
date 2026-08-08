ALTER TABLE tracking_product_kinds
  DROP CONSTRAINT IF EXISTS tracking_product_kinds_kind_check;
ALTER TABLE tracking_product_kinds
  ADD CONSTRAINT tracking_product_kinds_kind_check
  CHECK (kind IN ('front','upsell','upsell_2','upsell_3'));

ALTER TABLE tracking_orders
  DROP CONSTRAINT IF EXISTS tracking_orders_order_kind_check;
ALTER TABLE tracking_orders
  ADD CONSTRAINT tracking_orders_order_kind_check
  CHECK (order_kind IN ('front','upsell','upsell_2','upsell_3','unknown'));
