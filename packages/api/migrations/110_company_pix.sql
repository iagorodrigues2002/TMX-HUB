CREATE TABLE IF NOT EXISTS company_member_pix (
  company_id uuid NOT NULL,
  user_id text NOT NULL,
  key_encrypted text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,user_id),
  FOREIGN KEY(company_id,user_id) REFERENCES company_memberships(company_id,user_id) ON DELETE CASCADE
);
