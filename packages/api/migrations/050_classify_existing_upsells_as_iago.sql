-- The original upsell destinations belong to the Iago account. Classify them
-- explicitly and clear premature Lucas mappings so each account can be
-- configured independently from the dashboard.
WITH account_ids AS (
  SELECT
    project_id,
    max(id) FILTER (WHERE lower(name) LIKE '%iago%') AS iago_id,
    array_agg(id) FILTER (WHERE lower(name) LIKE '%lucas%') AS lucas_ids
  FROM vendepay_connections
  GROUP BY project_id
)
UPDATE tracking_upsell_stages stage
SET connection_destinations =
      (SELECT COALESCE(jsonb_object_agg(entry.key, entry.value), '{}'::jsonb)
       FROM jsonb_each(stage.connection_destinations) entry
       WHERE NOT (entry.key = ANY(COALESCE(accounts.lucas_ids, ARRAY[]::text[]))))
      || jsonb_build_object(accounts.iago_id, stage.destination_url),
    updated_at = now()
FROM account_ids accounts
WHERE accounts.project_id = stage.project_id
  AND accounts.iago_id IS NOT NULL;

