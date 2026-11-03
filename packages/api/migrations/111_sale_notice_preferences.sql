CREATE TABLE IF NOT EXISTS sale_notice_preferences (
  user_id text PRIMARY KEY,
  offer_ids text[] NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
