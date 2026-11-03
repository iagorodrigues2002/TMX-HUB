ALTER TABLE company_finance_connections ADD COLUMN IF NOT EXISTS notification_ready_at timestamptz;
UPDATE company_finance_connections SET notification_ready_at=now()
WHERE notification_ready_at IS NULL AND history_cursor>=now()-interval '1 hour';
CREATE TABLE IF NOT EXISTS company_finance_notifications (
 id uuid PRIMARY KEY,
 company_id uuid NOT NULL,
 connection_id uuid NOT NULL,
 external_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(connection_id,external_id),
 FOREIGN KEY(company_id,connection_id) REFERENCES company_finance_connections(company_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS company_finance_notifications_company_date ON company_finance_notifications(company_id,created_at DESC);
