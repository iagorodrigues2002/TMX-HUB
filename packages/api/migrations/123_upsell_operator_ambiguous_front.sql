CREATE FUNCTION reconcile_upsell_operator_ambiguous_front(
  target_id text, expected_operator text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  original tracking_upsell_operator_credits%ROWTYPE;
  updated tracking_upsell_operator_credits%ROWTYPE;
  sale tracking_orders%ROWTYPE;
  winner record;
BEGIN
  SELECT * INTO original FROM tracking_upsell_operator_credits
  WHERE order_id=target_id AND reason='ambiguous_front'
    AND operator_id IS NULL AND front_order_id IS NULL FOR UPDATE;
  IF NOT FOUND OR NOT upsell_operator_has_payment_proof(target_id) THEN RETURN false; END IF;
  SELECT * INTO sale FROM tracking_orders WHERE id=target_id;

  -- The front may be ambiguous even when every recent opening identifies the same operator.
  WITH candidate_fronts AS NOT MATERIALIZED (
    SELECT f.id,f.paid_at,f.visitor_id,f.buyer,f.attribution_source
    FROM tracking_orders f
    WHERE f.project_id=sale.project_id AND f.provider=sale.provider AND f.order_kind='front'
      AND f.paid_at<=sale.paid_at
      AND f.vendepay_connection_id IS NOT DISTINCT FROM sale.vendepay_connection_id
      AND f.syzepay_connection_id IS NOT DISTINCT FROM sale.syzepay_connection_id
  ), matched_fronts AS (
    SELECT f.id,f.paid_at FROM candidate_fronts f
    WHERE CASE
      WHEN NULLIF(sale.attribution_source->>'syzepay_session_id','') IS NOT NULL
        THEN f.attribution_source->>'syzepay_session_id'=sale.attribution_source->>'syzepay_session_id'
      WHEN sale.visitor_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM candidate_fronts v WHERE v.visitor_id=sale.visitor_id)
        THEN f.visitor_id=sale.visitor_id
      ELSE
        NULLIF(lower(trim(f.buyer->>'email')),'')=NULLIF(lower(trim(sale.buyer->>'email')),'')
        OR NULLIF(regexp_replace(f.buyer->>'phone','\D','','g'),'')
          =NULLIF(regexp_replace(sale.buyer->>'phone','\D','','g'),'')
    END
  ), recent AS (
    SELECT a.id,a.stage_key,a.operator_id,a.opened_at
    FROM matched_fronts f JOIN tracking_upsell_operator_attempts a ON a.order_id=f.id
    WHERE a.project_id=sale.project_id AND a.provider=sale.provider
      AND a.opened_at BETWEEN greatest(f.paid_at,original.approved_at-interval '5 minutes')
        AND original.approved_at
  )
  SELECT a.id,a.operator_id INTO winner FROM recent a
  WHERE a.stage_key=original.stage_key
    AND NOT EXISTS (SELECT 1 FROM recent other WHERE other.operator_id IS DISTINCT FROM a.operator_id)
  ORDER BY a.opened_at DESC,a.id DESC LIMIT 1;
  IF NOT FOUND OR (expected_operator IS NOT NULL AND winner.operator_id<>expected_operator)
    THEN RETURN false; END IF;

  UPDATE tracking_upsell_operator_credits
  SET operator_id=winner.operator_id,attempt_id=winner.id,
      reason='confirmed_operator_ambiguous_front',rule='operator_flow_v3',recorded_at=now()
  WHERE order_id=target_id RETURNING * INTO updated;
  INSERT INTO tracking_upsell_operator_credit_revisions(order_id,before_credit,after_credit)
  VALUES(target_id,to_jsonb(original),to_jsonb(updated));
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION reconcile_upsell_operator_sequences_after_order(target_id text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
  anchor tracking_upsell_operator_credits%ROWTYPE;
  target record;
BEGIN
  SELECT * INTO anchor FROM tracking_upsell_operator_credits WHERE order_id=target_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF anchor.front_order_id IS NULL THEN
    PERFORM reconcile_upsell_operator_ambiguous_front(target_id);
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(anchor.project_id),hashtext(anchor.front_order_id));
  FOR target IN
    SELECT c.order_id FROM tracking_upsell_operator_credits c
    WHERE c.project_id=anchor.project_id AND c.front_order_id=anchor.front_order_id
      AND c.approved_at>=anchor.approved_at AND c.approved_at<=anchor.approved_at+interval '1 hour'
    ORDER BY c.approved_at,c.order_id
  LOOP
    PERFORM reconcile_upsell_operator_sequence(target.order_id);
  END LOOP;
END $$;
