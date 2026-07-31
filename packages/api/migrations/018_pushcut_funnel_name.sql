-- Offers (funnels) live in Redis (OfferStore), not Postgres, so the
-- Pushcut delivery worker — a standalone Postgres-only process with no
-- Redis/offerStore access — can't resolve the funnel name at send time.
-- The webhook route (which does have app.offerStore) resolves it once at
-- ingestion and stores it here for the worker to read back.
ALTER TABLE tracking_delivery_outbox
  ADD COLUMN IF NOT EXISTS funnel_name text;
