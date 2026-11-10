CREATE TABLE tracking_pushcut_profiles (
  id text PRIMARY KEY,
  owner_user_id text NOT NULL,
  name text NOT NULL,
  secret_encrypted text NOT NULL,
  front_notification_name text NOT NULL,
  upsell_notification_name text,
  devices jsonb NOT NULL DEFAULT '[]'::jsonb,
  order_kinds text[] NOT NULL,
  show_amount boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pushcut_profiles_owner_idx ON tracking_pushcut_profiles(owner_user_id);
ALTER TABLE tracking_pushcut_destinations
  ADD COLUMN profile_id text REFERENCES tracking_pushcut_profiles(id),
  ADD COLUMN profile_selected boolean NOT NULL DEFAULT true,
  ADD COLUMN order_kinds text[],
  ADD COLUMN show_amount boolean NOT NULL DEFAULT true;
CREATE UNIQUE INDEX pushcut_destinations_profile_project_idx
  ON tracking_pushcut_destinations(profile_id, project_id);
