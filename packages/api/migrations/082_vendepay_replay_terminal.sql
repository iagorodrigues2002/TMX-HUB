ALTER TABLE webhook_receipts
  ADD COLUMN IF NOT EXISTS replay_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_replay_at timestamptz,
  ADD COLUMN IF NOT EXISTS replay_state text;

ALTER TABLE webhook_receipts
  DROP CONSTRAINT IF EXISTS webhook_receipts_replay_attempts_nonnegative,
  ADD CONSTRAINT webhook_receipts_replay_attempts_nonnegative CHECK (replay_attempts >= 0),
  DROP CONSTRAINT IF EXISTS webhook_receipts_replay_state_valid,
  ADD CONSTRAINT webhook_receipts_replay_state_valid CHECK (
    replay_state IS NULL OR replay_state IN ('quarantined', 'replaying', 'replayed', 'replay_failed')
  );

UPDATE webhook_receipts
SET replay_state = 'quarantined'
WHERE state = 'quarantined' AND replay_state IS NULL;

CREATE INDEX IF NOT EXISTS webhook_receipts_replay_queue_idx
  ON webhook_receipts(connection_id, received_at)
  WHERE state = 'quarantined' AND replay_state = 'quarantined' AND replay_attempts < 5;
