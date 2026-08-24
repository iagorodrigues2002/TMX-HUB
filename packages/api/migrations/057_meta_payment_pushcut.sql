ALTER TABLE meta_marketing_connections
  ADD COLUMN IF NOT EXISTS payment_pushcut_secret_encrypted text,
  ADD COLUMN IF NOT EXISTS payment_pushcut_notification_name text,
  ADD COLUMN IF NOT EXISTS payment_pushcut_devices jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_pushcut_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE meta_ad_accounts
  ADD COLUMN IF NOT EXISTS payment_alert_active boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS payment_alerted_at timestamptz;
