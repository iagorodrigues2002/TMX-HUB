CREATE TABLE IF NOT EXISTS tracking_upsell_identity_validation (
  order_id text PRIMARY KEY REFERENCES tracking_orders(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending' CHECK (state IN ('pending','processing','retry','confirmed','rejected','failed')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  lease_until timestamptz,
  lease_token text,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tracking_upsell_validation_pending_idx
  ON tracking_upsell_identity_validation(next_attempt_at)
  WHERE state IN ('pending','retry','processing');
