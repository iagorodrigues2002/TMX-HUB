CREATE TABLE IF NOT EXISTS managed_calls (
  id text PRIMARY KEY,
  body jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS managed_call_commands (
  id text PRIMARY KEY,
  call_id text NOT NULL REFERENCES managed_calls(id),
  revision integer NOT NULL,
  user_id text NOT NULL,
  request_hash text NOT NULL,
  body jsonb NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','succeeded','failed','superseded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS managed_call_commands_pending ON managed_call_commands(created_at) WHERE state='queued';
CREATE TABLE IF NOT EXISTS managed_call_reminders (
  id text PRIMARY KEY,
  call_id text NOT NULL REFERENCES managed_calls(id),
  revision integer NOT NULL,
  minutes integer NOT NULL,
  due_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','succeeded','failed','superseded','expired')),
  claimed_at timestamptz,
  delivered_at timestamptz,
  discord_message_id text
);
CREATE INDEX IF NOT EXISTS managed_call_reminders_pending ON managed_call_reminders(due_at) WHERE state='queued';
CREATE TABLE IF NOT EXISTS managed_call_notifications (
  id text NOT NULL,
  user_id text NOT NULL,
  call_id text NOT NULL REFERENCES managed_calls(id),
  revision integer NOT NULL,
  body jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  PRIMARY KEY(id,user_id)
);
CREATE INDEX IF NOT EXISTS managed_call_notifications_user ON managed_call_notifications(user_id,received_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS managed_task_people_tmx_user ON managed_task_people((body->>'userId')) WHERE body->>'userId' IS NOT NULL;
