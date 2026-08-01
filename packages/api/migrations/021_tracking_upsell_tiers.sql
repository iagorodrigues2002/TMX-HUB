-- Supports classifying a product as "upsell" (upsell 1) or "upsell_2"
-- separately, so conversion rate can be tracked per upsell tier instead of
-- one combined bucket. "front" and existing "upsell" rows are untouched.
ALTER TABLE tracking_product_kinds
  DROP CONSTRAINT tracking_product_kinds_kind_check;
ALTER TABLE tracking_product_kinds
  ADD CONSTRAINT tracking_product_kinds_kind_check
  CHECK (kind IN ('front', 'upsell', 'upsell_2'));

ALTER TABLE tracking_orders
  DROP CONSTRAINT tracking_orders_order_kind_check;
ALTER TABLE tracking_orders
  ADD CONSTRAINT tracking_orders_order_kind_check
  CHECK (order_kind IN ('front', 'upsell', 'upsell_2', 'unknown'));
