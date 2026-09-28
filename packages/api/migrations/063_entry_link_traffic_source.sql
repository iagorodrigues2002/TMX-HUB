-- Source belongs to the immutable public entry link, not to a redirect URL.
-- Existing links remain operational and are marked unknown until an operator
-- classifies them in the TMX UI.
ALTER TABLE tracking_entry_links
  ADD COLUMN IF NOT EXISTS traffic_source text NOT NULL DEFAULT 'unknown'
  CHECK (traffic_source IN ('meta','google','tiktok','native','organic','email','other','unknown'));
CREATE INDEX IF NOT EXISTS tracking_entry_links_source_idx
  ON tracking_entry_links(project_id, traffic_source, created_at DESC);
