ALTER TABLE company_finance_entries ADD COLUMN IF NOT EXISTS category_override text
  CHECK (category_override IN ('income','fixed','variable','withdrawal','transfer'));

CREATE TABLE IF NOT EXISTS company_finance_rules (
  company_id uuid PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  vendepay_income boolean NOT NULL DEFAULT false,
  withdrawal_recipient text NOT NULL DEFAULT '',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW company_finance_classified AS
SELECT e.*, coalesce(e.category_override, CASE
    WHEN coalesce(e.sent,0)>0 AND coalesce(e.received,0)=0
      AND length(regexp_replace(lower(coalesce(r.withdrawal_recipient,'')), '[^a-z0-9]', '', 'g'))>10
      AND position(regexp_replace(lower(r.withdrawal_recipient), '[^a-z0-9]', '', 'g') in regexp_replace(lower(e.description), '[^a-z0-9]', '', 'g'))>0 THEN 'withdrawal'
    WHEN r.vendepay_income AND regexp_replace(lower(e.description), '[^a-z0-9]', '', 'g') LIKE '%vendepay%'
      AND coalesce(e.received,0)>0 AND coalesce(e.sent,0)=0 THEN 'income'
    WHEN lower(e.kind) IN ('sell','withdraw','offramp') THEN 'withdrawal'
    ELSE 'unclassified' END) AS category
FROM company_finance_entries e LEFT JOIN company_finance_rules r ON r.company_id=e.company_id;
