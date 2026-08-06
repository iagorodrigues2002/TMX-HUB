ALTER TABLE recovery_messages
  ADD COLUMN IF NOT EXISTS click_token_hash text;

ALTER TABLE recovery_opportunities
  ADD COLUMN IF NOT EXISTS recovered_message_id text REFERENCES recovery_messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recovered_channel text;

CREATE UNIQUE INDEX IF NOT EXISTS recovery_messages_click_token_idx
  ON recovery_messages(click_token_hash)
  WHERE click_token_hash IS NOT NULL;

CREATE TABLE IF NOT EXISTS recovery_message_events (
  id text PRIMARY KEY,
  message_id text NOT NULL REFERENCES recovery_messages(id) ON DELETE CASCADE,
  opportunity_id text NOT NULL REFERENCES recovery_opportunities(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN ('sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed', 'converted')),
  provider_event_id text,
  event_at timestamptz NOT NULL DEFAULT now(),
  url text,
  ip text,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recovery_message_events_opportunity_idx
  ON recovery_message_events(opportunity_id, event_at DESC);
CREATE INDEX IF NOT EXISTS recovery_message_events_message_idx
  ON recovery_message_events(message_id, event_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS recovery_message_events_provider_idx
  ON recovery_message_events(message_id, provider_event_id)
  WHERE provider_event_id IS NOT NULL;

-- Preserve valid historical recoveries only when the buyer demonstrably clicked
-- a Recovery message before purchasing. Broad email/phone-only matches remain
-- out of the new deterministic analytics.
UPDATE recovery_opportunities ro
SET recovered_message_id = (
      SELECT rm.id FROM recovery_messages rm
      WHERE rm.opportunity_id=ro.id AND rm.clicked_at IS NOT NULL
        AND rm.clicked_at <= ro.recovered_at + interval '10 minutes'
      ORDER BY rm.clicked_at DESC LIMIT 1
    ),
    recovered_channel = (
      SELECT rc.kind FROM recovery_messages rm
      JOIN recovery_channels rc ON rc.id=rm.channel_id
      WHERE rm.opportunity_id=ro.id AND rm.clicked_at IS NOT NULL
        AND rm.clicked_at <= ro.recovered_at + interval '10 minutes'
      ORDER BY rm.clicked_at DESC LIMIT 1
    )
WHERE ro.status='recovered' AND ro.recovered_message_id IS NULL
  AND EXISTS (
    SELECT 1 FROM recovery_messages rm
    WHERE rm.opportunity_id=ro.id AND rm.clicked_at IS NOT NULL
      AND rm.clicked_at <= ro.recovered_at + interval '10 minutes'
  );
