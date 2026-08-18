ALTER TABLE tracking_upsell_stages
  DROP CONSTRAINT IF EXISTS tracking_upsell_stages_stage_key_check;
ALTER TABLE tracking_upsell_stages
  ADD CONSTRAINT tracking_upsell_stages_stage_key_check
  CHECK (stage_key ~ '^upsell_[1-9][0-9]*$');

ALTER TABLE tracking_product_kinds
  DROP CONSTRAINT IF EXISTS tracking_product_kinds_kind_check;
ALTER TABLE tracking_product_kinds
  ADD CONSTRAINT tracking_product_kinds_kind_check
  CHECK (kind = 'front' OR kind = 'upsell' OR kind ~ '^upsell_[2-9][0-9]*$');

ALTER TABLE tracking_orders
  DROP CONSTRAINT IF EXISTS tracking_orders_order_kind_check;
ALTER TABLE tracking_orders
  ADD CONSTRAINT tracking_orders_order_kind_check
  CHECK (order_kind IN ('front','upsell','unknown') OR order_kind ~ '^upsell_[2-9][0-9]*$');
