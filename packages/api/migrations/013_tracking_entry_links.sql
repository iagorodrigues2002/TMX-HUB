CREATE TABLE IF NOT EXISTS tracking_entry_links (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  destination_url text NOT NULL,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tracking_entry_links_project_idx
  ON tracking_entry_links(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS tracking_events_click_id_idx
  ON tracking_events(project_id, ((source->>'tmx_click_id')), received_at DESC)
  WHERE NULLIF(source->>'tmx_click_id', '') IS NOT NULL;
