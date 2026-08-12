ALTER TABLE tracking_upsell_stages
  ADD COLUMN IF NOT EXISTS connection_destinations jsonb NOT NULL DEFAULT '{}'::jsonb;

