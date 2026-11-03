CREATE TABLE IF NOT EXISTS company_finance_connections (
 id uuid PRIMARY KEY,
 company_id uuid NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
 provider text NOT NULL CHECK (provider IN ('wise','lootrush')),
 profile_id text NOT NULL,
 label text NOT NULL,
 key_encrypted text,
 status text NOT NULL DEFAULT 'queued',
 error_code text,
 history_start timestamptz NOT NULL,
 history_cursor timestamptz,
 history_supported boolean,
 balances jsonb NOT NULL DEFAULT '[]',
 last_sync_at timestamptz,
 next_sync_at timestamptz NOT NULL DEFAULT now(),
 lease_id uuid,
 lease_until timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,profile_id),
 UNIQUE(company_id,provider),
 UNIQUE(company_id,id)
);
CREATE TABLE IF NOT EXISTS company_finance_entries (
 company_id uuid NOT NULL,
 connection_id uuid NOT NULL,
 external_id text NOT NULL,
 operation_id text NOT NULL,
 occurred_at timestamptz NOT NULL,
 kind text NOT NULL,
 status text NOT NULL,
 description text NOT NULL,
 sent numeric,
 sent_currency text,
 received numeric,
 received_currency text,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(connection_id,external_id),
 FOREIGN KEY(company_id,connection_id) REFERENCES company_finance_connections(company_id,id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS company_finance_entries_date ON company_finance_entries(company_id,occurred_at DESC,external_id);
CREATE INDEX IF NOT EXISTS company_finance_sync_due ON company_finance_connections(next_sync_at) WHERE key_encrypted IS NOT NULL;
