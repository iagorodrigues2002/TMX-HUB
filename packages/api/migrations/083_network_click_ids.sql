ALTER TABLE tracking_events
  ADD COLUMN IF NOT EXISTS click_ids jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tracking_visitors
  ADD COLUMN IF NOT EXISTS click_ids jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE tracking_sessions
  ADD COLUMN IF NOT EXISTS click_ids jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE tracking_events
SET click_ids = jsonb_strip_nulls(jsonb_build_object(
  'fbc', COALESCE(
    NULLIF(source->>'fbc', ''),
    NULLIF(source->>'_fbc', ''),
    CASE WHEN NULLIF(source->>'fbclid', '') IS NOT NULL THEN
      'fb.1.' || COALESCE(
        NULLIF(source->>'_fbclid_ts', ''),
        (floor(extract(epoch FROM received_at) * 1000))::bigint::text
      ) || '.' || (source->>'fbclid')
    END
  ),
  'fbp', COALESCE(NULLIF(source->>'fbp', ''), NULLIF(source->>'_fbp', '')),
  'gclid', NULLIF(source->>'gclid', ''),
  'wbraid', NULLIF(source->>'wbraid', ''),
  'gbraid', NULLIF(source->>'gbraid', ''),
  'ttclid', NULLIF(source->>'ttclid', ''),
  'ttp', COALESCE(NULLIF(source->>'ttp', ''), NULLIF(source->>'_ttp', '')),
  'twclid', NULLIF(source->>'twclid', '')
))
WHERE click_ids = '{}'::jsonb AND source <> '{}'::jsonb;

UPDATE tracking_visitors
SET click_ids = jsonb_strip_nulls(jsonb_build_object(
  'fbc', COALESCE(
    NULLIF(first_source->>'fbc', ''),
    NULLIF(first_source->>'_fbc', ''),
    CASE WHEN NULLIF(first_source->>'fbclid', '') IS NOT NULL THEN
      'fb.1.' || COALESCE(
        NULLIF(first_source->>'_fbclid_ts', ''),
        (floor(extract(epoch FROM first_seen_at) * 1000))::bigint::text
      ) || '.' || (first_source->>'fbclid')
    END
  ),
  'fbp', COALESCE(NULLIF(first_source->>'fbp', ''), NULLIF(first_source->>'_fbp', '')),
  'gclid', NULLIF(first_source->>'gclid', ''),
  'wbraid', NULLIF(first_source->>'wbraid', ''),
  'gbraid', NULLIF(first_source->>'gbraid', ''),
  'ttclid', NULLIF(first_source->>'ttclid', ''),
  'ttp', COALESCE(NULLIF(first_source->>'ttp', ''), NULLIF(first_source->>'_ttp', '')),
  'twclid', NULLIF(first_source->>'twclid', '')
))
WHERE click_ids = '{}'::jsonb AND first_source <> '{}'::jsonb;

UPDATE tracking_sessions
SET click_ids = jsonb_strip_nulls(jsonb_build_object(
  'fbc', COALESCE(
    NULLIF(source->>'fbc', ''),
    NULLIF(source->>'_fbc', ''),
    CASE WHEN NULLIF(source->>'fbclid', '') IS NOT NULL THEN
      'fb.1.' || COALESCE(
        NULLIF(source->>'_fbclid_ts', ''),
        (floor(extract(epoch FROM started_at) * 1000))::bigint::text
      ) || '.' || (source->>'fbclid')
    END
  ),
  'fbp', COALESCE(NULLIF(source->>'fbp', ''), NULLIF(source->>'_fbp', '')),
  'gclid', NULLIF(source->>'gclid', ''),
  'wbraid', NULLIF(source->>'wbraid', ''),
  'gbraid', NULLIF(source->>'gbraid', ''),
  'ttclid', NULLIF(source->>'ttclid', ''),
  'ttp', COALESCE(NULLIF(source->>'ttp', ''), NULLIF(source->>'_ttp', '')),
  'twclid', NULLIF(source->>'twclid', '')
))
WHERE click_ids = '{}'::jsonb AND source <> '{}'::jsonb;
