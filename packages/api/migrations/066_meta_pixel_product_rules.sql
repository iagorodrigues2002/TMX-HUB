CREATE TABLE IF NOT EXISTS meta_pixel_products (
  pixel_id text NOT NULL REFERENCES meta_pixels(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (pixel_id, product_id)
);
