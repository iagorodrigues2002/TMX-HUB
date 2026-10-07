-- Keep TikTok's Test Events code with the destination so all deliveries can
-- switch to TikTok's debug environment without changing production payload code.
ALTER TABLE tracking_tiktok_destinations
  ADD COLUMN IF NOT EXISTS test_event_code text;
