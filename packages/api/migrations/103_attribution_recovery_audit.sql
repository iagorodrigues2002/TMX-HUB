-- Restricted operational evidence; never returned by public tracking endpoints.
CREATE TABLE IF NOT EXISTS tracking_attribution_repairs (
  order_id text PRIMARY KEY REFERENCES tracking_orders(id),
  receipt_id text NOT NULL REFERENCES tracking_gateway_webhook_receipts(id),
  source_before jsonb NOT NULL,
  source_after jsonb NOT NULL,
  repaired_at timestamptz NOT NULL DEFAULT now()
);
