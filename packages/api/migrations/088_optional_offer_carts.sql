CREATE TABLE IF NOT EXISTS tracking_cart_configs (
  project_id text PRIMARY KEY REFERENCES tracking_projects(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  product_name text NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  checkout_test_id text NOT NULL REFERENCES tracking_ab_tests(id),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS tracking_cart_baskets (
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  id uuid NOT NULL,
  visitor_id text NOT NULL,
  product_id text NOT NULL,
  product_name text NOT NULL,
  amount_minor integer NOT NULL CHECK (amount_minor > 0),
  currency text NOT NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity = 1),
  event_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, id),
  UNIQUE (project_id, event_id)
);
