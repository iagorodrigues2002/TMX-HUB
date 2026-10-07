ALTER TABLE tracking_google_ads_oauth_connections
  ADD COLUMN IF NOT EXISTS user_id text,
  ADD COLUMN IF NOT EXISTS offer_id text;

-- `connected_by` is non-null in migration 061 and is the authoritative owner
-- for connections created before explicit tenant binding was introduced.
UPDATE tracking_google_ads_oauth_connections
SET user_id = connected_by
WHERE user_id IS NULL;

ALTER TABLE tracking_google_ads_oauth_connections
  ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS google_ads_oauth_connection_tenant
  ON tracking_google_ads_oauth_connections(user_id, offer_id, connected_at DESC);
