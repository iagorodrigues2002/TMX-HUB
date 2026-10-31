CREATE TABLE IF NOT EXISTS notification_center_reads (
  user_id text NOT NULL,
  event_id text NOT NULL,
  read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id,event_id)
);
