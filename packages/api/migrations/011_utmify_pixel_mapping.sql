ALTER TABLE tracking_projects
  ADD COLUMN IF NOT EXISTS utmify_pixel_id text;

ALTER TABLE tracking_utmify_web_events
  ADD COLUMN IF NOT EXISTS external_pixel_id text;

CREATE INDEX IF NOT EXISTS tracking_projects_utmify_pixel_idx
  ON tracking_projects(utmify_pixel_id)
  WHERE utmify_pixel_id IS NOT NULL;
