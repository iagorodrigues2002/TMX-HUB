ALTER TABLE ads_intelligence_connections ADD COLUMN IF NOT EXISTS coverage_complete boolean NOT NULL DEFAULT false;
ALTER TABLE ads_intelligence_connections ADD COLUMN IF NOT EXISTS account_failures jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE ads_intelligence_connections ADD COLUMN IF NOT EXISTS platform_coverage jsonb NOT NULL DEFAULT '[]'::jsonb;
