-- The global UTMify destination used to receive every offer implicitly.
-- Keep that behavior as the default (a missing row means enabled) so this
-- migration never interrupts an existing operation. Explicit rows are only
-- needed after an administrator chooses the offers for the global dashboard.
CREATE TABLE IF NOT EXISTS tracking_utmify_global_offer_routes (
  project_id text PRIMARY KEY REFERENCES tracking_projects(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tracking_utmify_global_offer_routes_enabled_idx
  ON tracking_utmify_global_offer_routes(enabled, updated_at DESC);
