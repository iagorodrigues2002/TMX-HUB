CREATE TABLE IF NOT EXISTS company_member_compensation (
  company_id uuid NOT NULL,
  user_id text NOT NULL,
  month date NOT NULL CHECK (extract(day FROM month)=1),
  settings jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,user_id,month),
  FOREIGN KEY(company_id,user_id) REFERENCES company_memberships(company_id,user_id) ON DELETE CASCADE
);
