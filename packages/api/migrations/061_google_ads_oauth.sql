CREATE TABLE IF NOT EXISTS tracking_google_ads_credentials (
  destination_id text PRIMARY KEY REFERENCES tracking_google_ads_destinations(id),
  refresh_token_encrypted text NOT NULL,
  granted_scope text NOT NULL,
  connected_by text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tracking_google_ads_oauth_states (
  state_hash text PRIMARY KEY,
  destination_id text NOT NULL REFERENCES tracking_google_ads_destinations(id),
  user_id text NOT NULL,
  verifier_encrypted text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS google_ads_oauth_expiry ON tracking_google_ads_oauth_states(expires_at);

-- A Google sign-in is reusable. Destinations choose an existing connection
-- instead of storing a copy of the same refresh token for every account.
CREATE TABLE IF NOT EXISTS tracking_google_ads_oauth_connections (
  id text PRIMARY KEY,
  name text NOT NULL,
  refresh_token_encrypted text NOT NULL,
  granted_scope text NOT NULL,
  connected_by text NOT NULL,
  connected_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE tracking_google_ads_destinations
  ADD COLUMN IF NOT EXISTS oauth_connection_id text
  REFERENCES tracking_google_ads_oauth_connections(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS google_ads_destination_connection
  ON tracking_google_ads_destinations(oauth_connection_id)
  WHERE state = 'draft';
