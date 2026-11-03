CREATE TABLE IF NOT EXISTS companies (
  id uuid PRIMARY KEY,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 120),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS company_memberships (
  company_id uuid NOT NULL REFERENCES companies(id),
  user_id text NOT NULL,
  role text NOT NULL CHECK (role IN ('owner','admin','member')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended')),
  tools text[] NOT NULL DEFAULT '{}',
  all_offers boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(company_id,user_id)
);
CREATE INDEX IF NOT EXISTS company_memberships_user_idx ON company_memberships(user_id, status);
CREATE TABLE IF NOT EXISTS company_offers (
  company_id uuid NOT NULL REFERENCES companies(id),
  offer_id text NOT NULL UNIQUE,
  owner_user_id text NOT NULL,
  PRIMARY KEY(company_id,offer_id)
);
CREATE TABLE IF NOT EXISTS company_offer_grants (
  company_id uuid NOT NULL,
  user_id text NOT NULL,
  offer_id text NOT NULL,
  PRIMARY KEY(company_id,user_id,offer_id),
  FOREIGN KEY(company_id,user_id) REFERENCES company_memberships(company_id,user_id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,offer_id) REFERENCES company_offers(company_id,offer_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS company_access_audit (
  id bigserial PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES companies(id),
  actor_id text NOT NULL,
  action text NOT NULL,
  subject_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
