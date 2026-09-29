-- Test Events should be able to validate the same URL and optional matching
-- identifiers used by real purchases without creating an order.
ALTER TABLE tracking_tiktok_deliveries
  ADD COLUMN IF NOT EXISTS test_context jsonb NOT NULL DEFAULT '{}'::jsonb;
