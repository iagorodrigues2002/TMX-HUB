CREATE OR REPLACE VIEW company_finance_classified AS
SELECT e.*, CASE WHEN e.kind='card_topup' THEN 'card_topup'
  ELSE coalesce(e.category_override, CASE
    WHEN coalesce(e.sent,0)>0 AND coalesce(e.received,0)=0
      AND length(regexp_replace(lower(coalesce(r.withdrawal_recipient,'')), '[^a-z0-9]', '', 'g'))>10
      AND position(regexp_replace(lower(r.withdrawal_recipient), '[^a-z0-9]', '', 'g') in regexp_replace(lower(e.description), '[^a-z0-9]', '', 'g'))>0 THEN 'withdrawal'
    WHEN r.vendepay_income AND regexp_replace(lower(e.description), '[^a-z0-9]', '', 'g') LIKE '%vendepay%'
      AND coalesce(e.received,0)>0 AND coalesce(e.sent,0)=0 THEN 'income'
    WHEN lower(e.kind) IN ('sell','withdraw','offramp') THEN 'withdrawal'
    WHEN e.kind='card_charge' THEN 'variable'
    ELSE 'unclassified' END) END AS category
FROM company_finance_entries e LEFT JOIN company_finance_rules r ON r.company_id=e.company_id;

-- One-time replay of the saved initial window repairs old amounts and adds card history.
-- Existing entries and manual classifications remain; imports upsert stable provider IDs.
UPDATE company_finance_connections
SET history_cursor=NULL,history_supported=true,next_sync_at=now(),lease_id=NULL,lease_until=NULL
WHERE provider='lootrush' AND key_encrypted IS NOT NULL;
