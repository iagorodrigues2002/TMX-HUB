ALTER TABLE recovery_test_runs ADD COLUMN IF NOT EXISTS opened_at timestamptz;

CREATE TABLE IF NOT EXISTS recovery_test_events (
  id text PRIMARY KEY,
  test_run_id text NOT NULL REFERENCES recovery_test_runs(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('opened','clicked','checkout')),
  provider_event_id text,
  event_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS recovery_test_events_run_idx
  ON recovery_test_events(test_run_id,event_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS recovery_test_events_provider_idx
  ON recovery_test_events(test_run_id,provider_event_id)
  WHERE provider_event_id IS NOT NULL;

INSERT INTO recovery_test_events(id,test_run_id,event_type,event_at)
SELECT 'backfill-open-'||id,id,'opened',opened_at FROM recovery_test_runs WHERE opened_at IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO recovery_test_events(id,test_run_id,event_type,event_at)
SELECT 'backfill-click-'||id,id,'clicked',clicked_at FROM recovery_test_runs WHERE clicked_at IS NOT NULL
ON CONFLICT DO NOTHING;
INSERT INTO recovery_test_events(id,test_run_id,event_type,event_at)
SELECT 'backfill-checkout-'||id,id,'checkout',checkout_at FROM recovery_test_runs WHERE checkout_at IS NOT NULL
ON CONFLICT DO NOTHING;
