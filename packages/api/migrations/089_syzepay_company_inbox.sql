-- Isolated reception-only inbox: never participates in sales or delivery workers.
CREATE TABLE IF NOT EXISTS syzepay_company_connections (
  id text PRIMARY KEY,
  owner_id text NOT NULL,
  company_key text NOT NULL,
  company_name text NOT NULL,
  name text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  token_encrypted text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,company_key,name)
);
CREATE INDEX IF NOT EXISTS syzepay_company_owner_idx ON syzepay_company_connections(owner_id,company_key);
CREATE TABLE IF NOT EXISTS syzepay_inbox_receipts (
  id text PRIMARY KEY,
  connection_id text NOT NULL REFERENCES syzepay_company_connections(id),
  body_hash text NOT NULL,
  body_encrypted text NOT NULL,
  headers_encrypted text NOT NULL,
  content_type text NOT NULL,
  body_bytes integer NOT NULL,
  state text NOT NULL DEFAULT 'awaiting_mapping' CHECK(state='awaiting_mapping'),
  authenticity text NOT NULL DEFAULT 'token_only' CHECK(authenticity='token_only'),
  attempts integer NOT NULL DEFAULT 1,
  received_at timestamptz NOT NULL DEFAULT now(),
  last_received_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(connection_id,body_hash)
);
CREATE INDEX IF NOT EXISTS syzepay_inbox_connection_time_idx ON syzepay_inbox_receipts(connection_id,received_at DESC);
