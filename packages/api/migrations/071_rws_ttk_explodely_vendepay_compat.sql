-- One historic VendePay endpoint is intentionally configured in Explodely.
-- Persist the adapter on the exact connection (identified by the token hash),
-- rather than branching globally by offer/name or exposing the original token.
ALTER TABLE vendepay_connections
  ADD COLUMN IF NOT EXISTS payload_adapter text NOT NULL DEFAULT 'vendepay';

UPDATE vendepay_connections
SET payload_adapter = 'explodely'
WHERE token_hash = '5a52f2893c9a08012a4f236428520f630cef9871d0f4224301443108ba520fa2';
