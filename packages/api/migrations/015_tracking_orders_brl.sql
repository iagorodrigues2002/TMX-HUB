-- Multi-currency support: every order stores its BRL equivalent alongside
-- the original amount + currency. Conversion happens at webhook ingestion
-- against a rate cached from AwesomeAPI (economia.awesomeapi.com.br).

ALTER TABLE tracking_orders
  ADD COLUMN IF NOT EXISTS amount_brl_minor bigint,
  ADD COLUMN IF NOT EXISTS exchange_rate numeric(14,6),
  ADD COLUMN IF NOT EXISTS converted_at timestamptz;

-- Backfill existing BRL orders as identity-converted so summary queries
-- can rely on amount_brl_minor being set for every currency=BRL row.
UPDATE tracking_orders
SET amount_brl_minor = amount_minor,
    exchange_rate = 1,
    converted_at = COALESCE(paid_at, occurred_at)
WHERE currency = 'BRL'
  AND amount_minor IS NOT NULL
  AND amount_brl_minor IS NULL;

CREATE INDEX IF NOT EXISTS tracking_orders_project_paid_brl_idx
  ON tracking_orders(project_id, paid_at DESC)
  WHERE amount_brl_minor IS NOT NULL;

-- Shared rate cache. Rates are refreshed at most once per hour per pair
-- (fetch failures fall back to the last stored rate).
CREATE TABLE IF NOT EXISTS exchange_rate_cache (
  base_currency text NOT NULL,
  target_currency text NOT NULL,
  rate numeric(14,6) NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (base_currency, target_currency)
);
