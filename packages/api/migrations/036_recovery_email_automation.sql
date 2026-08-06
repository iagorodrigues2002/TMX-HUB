ALTER TABLE recovery_settings
  ADD COLUMN IF NOT EXISTS email_automation_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS email_delay_minutes integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS automation_started_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE recovery_settings
  DROP CONSTRAINT IF EXISTS recovery_settings_email_delay_minutes_check;

ALTER TABLE recovery_settings
  ADD CONSTRAINT recovery_settings_email_delay_minutes_check
  CHECK (email_delay_minutes BETWEEN 1 AND 1440);

CREATE INDEX IF NOT EXISTS recovery_orders_automation_idx
  ON tracking_orders(project_id, updated_at)
  WHERE status IN ('pending','abandoned','refused','failed','cancelled');
