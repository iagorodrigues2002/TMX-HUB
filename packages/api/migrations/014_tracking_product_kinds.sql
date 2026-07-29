CREATE TABLE IF NOT EXISTS tracking_product_kinds (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('front', 'upsell')),
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, product_id)
);

ALTER TABLE tracking_orders
  ADD COLUMN IF NOT EXISTS order_kind text NOT NULL DEFAULT 'unknown'
    CHECK (order_kind IN ('front', 'upsell', 'unknown'));

CREATE INDEX IF NOT EXISTS tracking_orders_project_kind_idx
  ON tracking_orders(project_id, order_kind);
