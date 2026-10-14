ALTER TABLE ads_intelligence_connections ADD COLUMN IF NOT EXISTS retry_attempts integer NOT NULL DEFAULT 0 CHECK (retry_attempts BETWEEN 0 AND 2);
ALTER TABLE ads_intelligence_connections ADD COLUMN IF NOT EXISTS import_lease_token text;
-- Older interrupted imports committed cursor/data but did not publish coverage.
-- Repair metadata only for valid cursors with retained physical rows.
UPDATE ads_intelligence_connections c SET
 coverage_from=COALESCE(c.coverage_from,'2026-08-01'::date),
 coverage_to=GREATEST(c.coverage_to,c.cursor_date-1),coverage_complete=false
WHERE c.range_end IS NOT NULL AND c.cursor_date>'2026-08-01'::date
 AND c.cursor_date<=(now() AT TIME ZONE 'America/Sao_Paulo')::date
 AND c.range_end>=c.cursor_date
 AND EXISTS(SELECT 1 FROM ads_intelligence_daily d WHERE d.owner_id=c.owner_id AND d.day<c.cursor_date);
