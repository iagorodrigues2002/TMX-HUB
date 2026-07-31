-- tracking_delivery_outbox.destination_kind had a CHECK constraint that
-- only ever allowed 'utmify' (set when the table was first created, before
-- Pushcut existed). Migration 016 started inserting destination_kind =
-- 'pushcut' rows without updating this constraint, so every such INSERT
-- has been violating it and raising a Postgres error.
--
-- CRITICAL: the webhook handler in routes/tracking-public.ts inserts the
-- Pushcut outbox row inside the SAME transaction as the order upsert and
-- UTMify outbox insert. A constraint violation there rolls back the WHOLE
-- transaction — meaning any real Vendepay webhook for an offer with an
-- enabled Pushcut destination would have silently lost the entire order
-- (not just the Pushcut notification) since the destination was created.
ALTER TABLE tracking_delivery_outbox
  DROP CONSTRAINT tracking_delivery_outbox_destination_kind_check;
ALTER TABLE tracking_delivery_outbox
  ADD CONSTRAINT tracking_delivery_outbox_destination_kind_check
  CHECK (destination_kind IN ('utmify', 'pushcut'));
