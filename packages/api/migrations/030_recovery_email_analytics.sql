ALTER TABLE recovery_channels
  ADD COLUMN IF NOT EXISTS webhook_token_hash text,
  ADD COLUMN IF NOT EXISTS provider_webhook_id text;

ALTER TABLE recovery_messages
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS clicked_at timestamptz,
  ADD COLUMN IF NOT EXISTS bounced_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_event jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS recovery_messages_provider_message_idx
  ON recovery_messages(provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS recovery_channels_webhook_token_idx
  ON recovery_channels(webhook_token_hash)
  WHERE webhook_token_hash IS NOT NULL;
