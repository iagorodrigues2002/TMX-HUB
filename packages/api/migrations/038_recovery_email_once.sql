CREATE TABLE IF NOT EXISTS recovery_email_dispatches (
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  email_normalized text NOT NULL,
  state text NOT NULL CHECK (state IN ('reserved','sent','failed')),
  message_id text REFERENCES recovery_messages(id) ON DELETE SET NULL,
  reserved_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(project_id,email_normalized)
);

CREATE INDEX IF NOT EXISTS recovery_email_dispatches_state_idx
  ON recovery_email_dispatches(project_id,state,updated_at DESC);
