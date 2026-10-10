ALTER TABLE tracking_gateway_connections ADD COLUMN IF NOT EXISTS fee_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
