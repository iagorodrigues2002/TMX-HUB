-- Native records coexist with legacy data; no import or destructive conversion.
CREATE TABLE IF NOT EXISTS managed_native_requests (
  id text PRIMARY KEY,
  actor_id text NOT NULL,
  request_hash text NOT NULL,
  action text NOT NULL,
  entity_kind text NOT NULL CHECK (entity_kind IN ('task','call')),
  entity_id text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS managed_native_deliveries (
  id text PRIMARY KEY,
  entity_kind text NOT NULL CHECK (entity_kind IN ('task','call','reminder')),
  entity_id text NOT NULL,
  revision integer NOT NULL CHECK (revision>0),
  body jsonb NOT NULL,
  target_channel_id text,
  state text NOT NULL DEFAULT 'queued' CHECK (state IN ('queued','processing','succeeded','failed','uncertain','expired')),
  attempts integer NOT NULL DEFAULT 0,
  available_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  claimed_revision integer,
  lease_id text,
  lease_expires_at timestamptz,
  delivered_at timestamptz,
  error_code text,
  discord_message_id text,
  discord_channel_id text,
  last_result jsonb
);
CREATE INDEX IF NOT EXISTS managed_native_deliveries_pending
  ON managed_native_deliveries(available_at,id) WHERE state='queued';
CREATE INDEX IF NOT EXISTS managed_tasks_native_updated
  ON managed_tasks(updated_at DESC,id) WHERE body->>'managementMode'='native';
