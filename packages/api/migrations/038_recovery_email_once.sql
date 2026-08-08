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

INSERT INTO recovery_email_dispatches
  (project_id,email_normalized,state,message_id,reserved_at,sent_at,updated_at)
SELECT DISTINCT ON (ro.project_id,lower(trim(ro.email)))
  ro.project_id,lower(trim(ro.email)),'sent',rm.id,
  COALESCE(rm.sent_at,rm.created_at),COALESCE(rm.sent_at,rm.created_at),now()
FROM recovery_messages rm
JOIN recovery_channels rc ON rc.id=rm.channel_id AND rc.kind='email'
JOIN recovery_opportunities ro ON ro.id=rm.opportunity_id
WHERE rm.state IN ('sent','delivered','read') AND NULLIF(trim(ro.email),'') IS NOT NULL
ORDER BY ro.project_id,lower(trim(ro.email)),rm.sent_at DESC NULLS LAST,rm.created_at DESC
ON CONFLICT(project_id,email_normalized) DO NOTHING;
