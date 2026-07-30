-- Pushcut notifications for approved sales (front) and upsells. Multiple
-- destinations per project are explicitly supported (one row per Pushcut
-- account/device the operator wants notified) — unlike UTMify, there is no
-- UNIQUE(project_id) constraint here.
CREATE TABLE IF NOT EXISTS tracking_pushcut_destinations (
  id text PRIMARY KEY,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  secret_encrypted text NOT NULL,
  -- Pushcut notification name (or Reference ID) to trigger for a front sale.
  front_notification_name text NOT NULL,
  -- Notification name for upsells. Nullable: a destination can opt out of
  -- upsell notifications entirely while still receiving front-sale alerts.
  upsell_notification_name text,
  -- Optional device name targeting (Pushcut's "devices" JSON key). Empty
  -- array means "all devices linked to this account".
  devices jsonb NOT NULL DEFAULT '[]'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS tracking_pushcut_destinations_project_idx
  ON tracking_pushcut_destinations(project_id);

-- Deliveries reuse the existing generic tracking_delivery_outbox
-- (destination_kind = 'pushcut'), same reliable-delivery pattern already
-- used for UTMify orders (idempotency, backoff, dead-lettering).
