ALTER TABLE tracking_entry_links
  ADD COLUMN IF NOT EXISTS ab_test_id text REFERENCES tracking_ab_tests(id) ON DELETE SET NULL;

DROP INDEX IF EXISTS tracking_ab_one_active_idx;

CREATE INDEX IF NOT EXISTS tracking_ab_active_project_idx
  ON tracking_ab_tests(project_id, created_at DESC)
  WHERE status = 'active' AND deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS tracking_entry_links_ab_test_idx
  ON tracking_entry_links(ab_test_id)
  WHERE ab_test_id IS NOT NULL;
