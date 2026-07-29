ALTER TABLE meta_deliveries
  ADD COLUMN IF NOT EXISTS response_status integer,
  ADD COLUMN IF NOT EXISTS provider_event_count integer;

ALTER TABLE tracking_utmify_web_events
  ALTER COLUMN pixel_id DROP NOT NULL;

ALTER TABLE tracking_utmify_web_events
  DROP CONSTRAINT IF EXISTS tracking_utmify_web_events_pixel_id_event_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tracking_utmify_web_events_project_event_key'
  ) THEN
    ALTER TABLE tracking_utmify_web_events
      ADD CONSTRAINT tracking_utmify_web_events_project_event_key
      UNIQUE (project_id, event_id);
  END IF;
END
$$;
