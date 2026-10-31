-- Additive only. Do not run against production until explicitly approved.
CREATE TABLE IF NOT EXISTS managed_task_people (
  id text PRIMARY KEY,
  clickup_id text UNIQUE,
  discord_id text UNIQUE,
  body jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS managed_tasks (
  id text PRIMARY KEY,
  clickup_id text UNIQUE,
  body jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS managed_task_events (
  event_id text PRIMARY KEY,
  task_id text NOT NULL REFERENCES managed_tasks(id),
  body jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS managed_task_commands (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  request_hash text NOT NULL,
  task_id text NOT NULL REFERENCES managed_tasks(id),
  body jsonb NOT NULL,
  state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','processing','succeeded','failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  claimed_at timestamptz,
  finished_at timestamptz
);
CREATE INDEX IF NOT EXISTS managed_task_commands_queued ON managed_task_commands(created_at) WHERE state='queued';
CREATE UNIQUE INDEX IF NOT EXISTS managed_task_one_command ON managed_task_commands(task_id) WHERE state IN ('queued','processing');
CREATE INDEX IF NOT EXISTS managed_tasks_updated ON managed_tasks(updated_at DESC,id);
CREATE INDEX IF NOT EXISTS managed_task_events_task ON managed_task_events(task_id,received_at DESC);
