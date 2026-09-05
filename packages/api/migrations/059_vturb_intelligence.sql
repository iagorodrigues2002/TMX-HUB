ALTER TABLE vturb_integrations
  ADD COLUMN IF NOT EXISTS analytics_token_encrypted text,
  ADD COLUMN IF NOT EXISTS player_id text,
  ADD COLUMN IF NOT EXISTS conversion_param text NOT NULL DEFAULT 'vtid',
  ADD COLUMN IF NOT EXISTS last_validated_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

ALTER TABLE vturb_deliveries
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS response_status integer,
  ADD COLUMN IF NOT EXISTS response_body text,
  ADD COLUMN IF NOT EXISTS conversion_key text;

CREATE INDEX IF NOT EXISTS vturb_deliveries_retry_idx
  ON vturb_deliveries(state, next_attempt_at)
  WHERE state IN ('waiting', 'failed');
