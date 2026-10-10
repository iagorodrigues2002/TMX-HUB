ALTER TABLE syzepay_company_connections ADD COLUMN IF NOT EXISTS fee_settings jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE syzepay_company_connections ADD COLUMN IF NOT EXISTS fees_updated_at timestamptz;
