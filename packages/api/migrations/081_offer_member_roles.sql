DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'offer_member_role') THEN
    CREATE TYPE offer_member_role AS ENUM ('owner', 'tracking_manager', 'member');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS offer_members (
  offer_id text NOT NULL,
  user_id text NOT NULL,
  role offer_member_role NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (offer_id, user_id)
);

ALTER TABLE offer_members
  ADD COLUMN IF NOT EXISTS role offer_member_role NOT NULL DEFAULT 'member';

-- Conservative migration: every pre-existing relationship remains a regular
-- member until an owner explicitly grants tracking_manager.
UPDATE offer_members SET role='member' WHERE role IS NULL;

CREATE INDEX IF NOT EXISTS offer_members_user_role_idx
  ON offer_members(user_id, role);
