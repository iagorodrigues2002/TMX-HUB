-- No historical backfill: only future transitions to paid create push events.
SET LOCAL lock_timeout='2s';
SET LOCAL statement_timeout='10s';
CREATE TABLE IF NOT EXISTS browser_push_subscriptions (
  id text PRIMARY KEY,
  user_id text NOT NULL,
  secret_encrypted text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS browser_sale_events (
  order_id text PRIMARY KEY REFERENCES tracking_orders(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS browser_sale_events_created_idx ON browser_sale_events(created_at);
CREATE TABLE IF NOT EXISTS browser_push_deliveries (
  order_id text NOT NULL REFERENCES browser_sale_events(order_id) ON DELETE CASCADE,
  subscription_id text NOT NULL REFERENCES browser_push_subscriptions(id) ON DELETE CASCADE,
  state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','delivered','skipped','dead')),
  attempts integer NOT NULL DEFAULT 0,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(order_id, subscription_id)
);
CREATE INDEX IF NOT EXISTS browser_push_deliveries_due_idx ON browser_push_deliveries(next_attempt_at)
  WHERE state IN ('pending','processing');

CREATE OR REPLACE FUNCTION capture_browser_sale_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='paid' THEN
    IF TG_OP='INSERT' OR OLD.status IS DISTINCT FROM 'paid' THEN
      INSERT INTO browser_sale_events(order_id) VALUES(NEW.id) ON CONFLICT DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS capture_browser_sale_event ON tracking_orders;
CREATE TRIGGER capture_browser_sale_event AFTER INSERT OR UPDATE OF status ON tracking_orders
  FOR EACH ROW EXECUTE FUNCTION capture_browser_sale_event();
