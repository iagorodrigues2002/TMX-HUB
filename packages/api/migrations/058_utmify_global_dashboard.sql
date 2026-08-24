ALTER TABLE tracking_utmify_destinations
  ALTER COLUMN project_id DROP NOT NULL;

ALTER TABLE tracking_utmify_destinations
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'offer',
  ADD COLUMN IF NOT EXISTS external_pixel_id text;

ALTER TABLE tracking_utmify_destinations
  DROP CONSTRAINT IF EXISTS tracking_utmify_destinations_project_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS tracking_utmify_destinations_offer_unique
  ON tracking_utmify_destinations(project_id)
  WHERE scope='offer';

CREATE UNIQUE INDEX IF NOT EXISTS tracking_utmify_destinations_global_unique
  ON tracking_utmify_destinations(scope)
  WHERE scope='global';

ALTER TABLE tracking_utmify_web_events
  DROP CONSTRAINT IF EXISTS tracking_utmify_web_events_project_event_key;

CREATE UNIQUE INDEX IF NOT EXISTS tracking_utmify_web_events_pixel_event_unique
  ON tracking_utmify_web_events(project_id,external_pixel_id,event_id);

CREATE INDEX IF NOT EXISTS tracking_utmify_destinations_scope_idx
  ON tracking_utmify_destinations(scope,enabled,updated_at DESC);
