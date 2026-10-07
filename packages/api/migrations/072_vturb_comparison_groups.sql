ALTER TABLE vturb_integrations
  ADD COLUMN IF NOT EXISTS comparison_group_id text;
