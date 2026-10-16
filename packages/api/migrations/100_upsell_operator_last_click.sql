ALTER TABLE tracking_upsell_operator_attempts
  ADD COLUMN IF NOT EXISTS view_only boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS upsell_attempt_target_time_idx
  ON tracking_upsell_operator_attempts(project_id,order_id,stage_key,provider,opened_at DESC,id DESC);

-- Separate operational attribution; never changes financial/ad attribution.
CREATE TABLE IF NOT EXISTS tracking_upsell_operator_credits (
  order_id text PRIMARY KEY REFERENCES tracking_orders(id) ON DELETE CASCADE,
  project_id text NOT NULL REFERENCES tracking_projects(id) ON DELETE CASCADE,
  front_order_id text,
  stage_key text NOT NULL,
  attempt_id text,
  operator_id text,
  approved_at timestamptz NOT NULL,
  reason text NOT NULL,
  rule text NOT NULL DEFAULT 'last_preapproval_click_v1',
  recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS upsell_operator_credits_project_idx
  ON tracking_upsell_operator_credits(project_id,operator_id,approved_at);

CREATE OR REPLACE FUNCTION record_upsell_operator_credit(target_id text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  sale tracking_orders%ROWTYPE;
  fronts text[];
  selected_attempt record;
  stage text;
BEGIN
  IF EXISTS(SELECT 1 FROM tracking_upsell_operator_credits WHERE order_id=target_id) THEN RETURN; END IF;
  SELECT * INTO sale FROM tracking_orders WHERE id=target_id;
  IF NOT FOUND OR sale.paid_at IS NULL OR sale.provider NOT IN ('vendepay','syzepay')
    OR NOT (sale.order_kind='upsell' OR sale.order_kind ~ '^upsell_[2-9][0-9]*$') THEN RETURN; END IF;
  stage := CASE WHEN sale.order_kind='upsell' THEN 'upsell_1' ELSE sale.order_kind END;
  SELECT array_agg(f.id) INTO fronts FROM tracking_orders f
  WHERE f.project_id=sale.project_id AND f.provider=sale.provider AND f.order_kind='front'
    AND f.paid_at IS NOT NULL AND f.paid_at<=sale.paid_at
    AND f.vendepay_connection_id IS NOT DISTINCT FROM sale.vendepay_connection_id
    AND f.syzepay_connection_id IS NOT DISTINCT FROM sale.syzepay_connection_id
    AND CASE
      WHEN NULLIF(sale.attribution_source->>'syzepay_session_id','') IS NOT NULL
        THEN f.attribution_source->>'syzepay_session_id'=sale.attribution_source->>'syzepay_session_id'
      WHEN sale.visitor_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM tracking_orders v WHERE v.project_id=sale.project_id
          AND v.provider=sale.provider AND v.order_kind='front' AND v.paid_at<=sale.paid_at
          AND v.visitor_id=sale.visitor_id
          AND v.vendepay_connection_id IS NOT DISTINCT FROM sale.vendepay_connection_id
          AND v.syzepay_connection_id IS NOT DISTINCT FROM sale.syzepay_connection_id
      ) THEN f.visitor_id=sale.visitor_id
      ELSE
        (NULLIF(lower(trim(sale.buyer->>'email')),'') IS NOT NULL
          AND lower(trim(f.buyer->>'email'))=lower(trim(sale.buyer->>'email')))
        OR (NULLIF(regexp_replace(sale.buyer->>'phone','\D','','g'),'') IS NOT NULL
          AND regexp_replace(f.buyer->>'phone','\D','','g')=regexp_replace(sale.buyer->>'phone','\D','','g'))
    END;
  SELECT NULL::text AS id,NULL::text AS operator_id INTO selected_attempt;
  IF cardinality(fronts)=1 THEN
    SELECT a.id,a.operator_id INTO selected_attempt FROM tracking_upsell_operator_attempts a
    WHERE a.project_id=sale.project_id AND a.order_id=fronts[1]
      AND a.provider=sale.provider AND a.stage_key=stage AND NOT a.view_only
      AND a.opened_at<=sale.paid_at
      AND a.opened_at>=(SELECT paid_at FROM tracking_orders WHERE id=fronts[1])
    ORDER BY a.opened_at DESC,a.id DESC LIMIT 1;
  END IF;
  INSERT INTO tracking_upsell_operator_credits(order_id,project_id,front_order_id,stage_key,attempt_id,operator_id,approved_at,reason)
  VALUES(sale.id,sale.project_id,CASE WHEN cardinality(fronts)=1 THEN fronts[1] END,
    stage,selected_attempt.id,selected_attempt.operator_id,sale.paid_at,
    CASE WHEN cardinality(fronts)>1 THEN 'ambiguous_front'
      WHEN fronts IS NULL THEN 'front_not_found'
      WHEN selected_attempt.id IS NULL THEN 'no_preapproval_click' ELSE 'last_preapproval_click' END)
  ON CONFLICT(order_id) DO NOTHING;
END $$;

CREATE OR REPLACE FUNCTION capture_upsell_operator_credit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM record_upsell_operator_credit(NEW.id);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS capture_upsell_operator_credit ON tracking_orders;
CREATE TRIGGER capture_upsell_operator_credit AFTER INSERT OR UPDATE ON tracking_orders
FOR EACH ROW WHEN(NEW.paid_at IS NOT NULL) EXECUTE FUNCTION capture_upsell_operator_credit();

-- Reconcile only existing approvals for which an operator audit already existed.
-- No payment/webhook/delivery is created or replayed.
DO $$ DECLARE target record; BEGIN
  FOR target IN
    SELECT o.id FROM tracking_orders o
    WHERE o.provider IN ('vendepay','syzepay') AND o.paid_at IS NOT NULL
      AND (o.order_kind='upsell' OR o.order_kind ~ '^upsell_[2-9][0-9]*$')
      AND o.paid_at >= (SELECT min(a.opened_at) FROM tracking_upsell_operator_attempts a WHERE a.project_id=o.project_id)
  LOOP PERFORM record_upsell_operator_credit(target.id); END LOOP;
END $$;
