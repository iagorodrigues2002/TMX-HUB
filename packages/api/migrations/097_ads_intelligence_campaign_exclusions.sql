-- Owner-scoped, reversible display exclusion. Preserve all physical snapshots.
ALTER TABLE ads_intelligence_connections
  ADD COLUMN IF NOT EXISTS excluded_campaigns jsonb NOT NULL DEFAULT '[]'::jsonb;
