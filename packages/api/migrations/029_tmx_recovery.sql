CREATE TABLE IF NOT EXISTS recovery_settings (
  project_id text PRIMARY KEY REFERENCES tracking_projects(id) ON DELETE CASCADE,
  checkout_url text,
  sender_name text NOT NULL DEFAULT 'TMX',
  quiet_start smallint NOT NULL DEFAULT 21 CHECK (quiet_start BETWEEN 0 AND 23),
  quiet_end smallint NOT NULL DEFAULT 8 CHECK (quiet_end BETWEEN 0 AND 23),
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recovery_channels (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('whatsapp', 'sms', 'email')),
  credentials_encrypted text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, kind)
);

CREATE TABLE IF NOT EXISTS recovery_opportunities (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  order_id text NOT NULL REFERENCES tracking_orders(id) ON DELETE CASCADE,
  recovered_order_id text REFERENCES tracking_orders(id) ON DELETE SET NULL,
  visitor_id text,
  buyer_name text,
  email text,
  phone text,
  status text NOT NULL DEFAULT 'eligible'
    CHECK (status IN ('eligible', 'contacted', 'clicked', 'recovered', 'suppressed', 'expired')),
  reason text NOT NULL,
  recovery_token_hash text NOT NULL UNIQUE,
  recovery_token_encrypted text NOT NULL,
  destination_url text NOT NULL,
  original_source jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_contact_at timestamptz,
  last_contact_at timestamptz,
  clicked_at timestamptz,
  recovered_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, order_id)
);

CREATE TABLE IF NOT EXISTS recovery_messages (
  id text PRIMARY KEY,
  opportunity_id text NOT NULL REFERENCES recovery_opportunities(id) ON DELETE CASCADE,
  channel_id text NOT NULL REFERENCES recovery_channels(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending'
    CHECK (state IN ('pending', 'sent', 'delivered', 'read', 'failed', 'cancelled')),
  provider_message_id text,
  content_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  response_status integer,
  last_error text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS recovery_opportunities_project_status_idx
  ON recovery_opportunities(project_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS recovery_messages_opportunity_idx
  ON recovery_messages(opportunity_id, created_at DESC);
