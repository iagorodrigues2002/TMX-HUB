-- Per-offer payment-gateway fee configuration, used to compute net revenue
-- ("líquido") alongside the gross totals already shown in the funnel KPIs.
-- Defaults mirror Vendepay's "Taxas Mercado Global" card so every offer
-- gets a sensible net calculation before anyone configures anything.
CREATE TABLE IF NOT EXISTS tracking_fee_settings (
  project_id text PRIMARY KEY REFERENCES tracking_projects(id) ON DELETE CASCADE,
  vendepay_fee_pct numeric(6,3) NOT NULL DEFAULT 9.9,
  extra_fee_minor bigint NOT NULL DEFAULT 149,
  extra_fee_currency text NOT NULL DEFAULT 'USD',
  reserve_pct numeric(6,3) NOT NULL DEFAULT 6.9,
  reserve_days integer NOT NULL DEFAULT 90,
  payout_days integer NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now()
);
