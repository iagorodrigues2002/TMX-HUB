ALTER TABLE tracking_upsell_operator_credits
  ADD COLUMN anchor_order_id text REFERENCES tracking_orders(id) ON DELETE SET NULL;
CREATE INDEX upsell_operator_credit_front_time_idx
  ON tracking_upsell_operator_credits(project_id,front_order_id,approved_at);

CREATE TABLE tracking_upsell_operator_credit_revisions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id text NOT NULL REFERENCES tracking_orders(id) ON DELETE CASCADE,
  before_credit jsonb NOT NULL,
  after_credit jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION upsell_operator_has_payment_proof(target_id text) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM tracking_orders o WHERE o.id=target_id AND o.paid_at IS NOT NULL
      AND (
        (o.provider='vendepay' AND EXISTS (
          SELECT 1 FROM webhook_receipts r WHERE r.order_id=o.id
            AND r.connection_id=o.vendepay_connection_id AND r.state='processed'
            AND lower(COALESCE(r.payload->>'test','false')) NOT IN ('true','1')
            AND lower(COALESCE(r.payload->>'is_test','false')) NOT IN ('true','1')
        )) OR (o.provider='syzepay' AND EXISTS (
          SELECT 1 FROM syzepay_inbox_receipts r WHERE r.tracking_order_id=o.id
            AND r.connection_id=o.syzepay_connection_id AND r.state='processed'
            AND r.authenticity='signature_verified'
        ))
      )
  )
$$;

-- Infer only a paid continuation of the same uniquely resolved front and gateway.
-- A different direct winner is never replaced; no synthetic click is created.
CREATE FUNCTION reconcile_upsell_operator_sequence(target_id text, expected_operator text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE
  original tracking_upsell_operator_credits%ROWTYPE;
  updated tracking_upsell_operator_credits%ROWTYPE;
  sale tracking_orders%ROWTYPE;
  prior record;
  opening record;
  chosen_operator text;
  chosen_attempt text;
  chosen_anchor text;
  chosen_reason text;
BEGIN
  SELECT * INTO original FROM tracking_upsell_operator_credits WHERE order_id=target_id;
  IF NOT FOUND OR original.front_order_id IS NULL THEN RETURN false; END IF;
  PERFORM pg_advisory_xact_lock(hashtext(original.project_id),hashtext(original.front_order_id));
  SELECT * INTO original FROM tracking_upsell_operator_credits WHERE order_id=target_id FOR UPDATE;
  SELECT * INTO sale FROM tracking_orders WHERE id=target_id;
  IF NOT upsell_operator_has_payment_proof(target_id) THEN RETURN false; END IF;

  -- A reopen can lead to a new payment even when the UI marked it "already bought".
  -- It never replaces a different credited person or retroactively counts a later view.
  SELECT a.* INTO opening FROM tracking_upsell_operator_attempts a
  WHERE a.project_id=original.project_id AND a.order_id=original.front_order_id
    AND a.provider=sale.provider AND a.opened_at<=original.approved_at
    AND a.opened_at>=original.approved_at-interval '5 minutes'
    AND a.opened_at>=(SELECT paid_at FROM tracking_orders WHERE id=original.front_order_id)
    AND (expected_operator IS NULL OR a.operator_id=expected_operator)
    AND (
      (a.view_only AND a.stage_key=original.stage_key
        AND (original.operator_id IS NULL OR (a.operator_id=original.operator_id
          AND a.opened_at>(SELECT opened_at FROM tracking_upsell_operator_attempts WHERE id=original.attempt_id))))
      OR (original.operator_id IS NULL AND NOT a.view_only
        AND substring(a.stage_key from '[0-9]+')::int<substring(original.stage_key from '[0-9]+')::int)
    )
  ORDER BY a.opened_at DESC,a.id DESC LIMIT 1;
  IF FOUND THEN
    IF EXISTS(SELECT 1 FROM tracking_upsell_operator_attempts conflict
      WHERE conflict.project_id=original.project_id AND conflict.order_id=original.front_order_id
        AND conflict.provider=sale.provider AND conflict.operator_id<>opening.operator_id
        AND conflict.opened_at>=opening.opened_at AND conflict.opened_at<=original.approved_at)
      THEN RETURN false; END IF;
    chosen_operator := opening.operator_id;
    chosen_attempt := opening.id;
    chosen_reason := CASE WHEN opening.view_only THEN 'confirmed_reopen' ELSE 'same_front_operator_flow' END;
  ELSE
  IF original.operator_id IS NOT NULL OR original.reason<>'no_preapproval_click' THEN RETURN false; END IF;
  SELECT c.*,o.provider,o.vendepay_connection_id,o.syzepay_connection_id INTO prior
  FROM tracking_upsell_operator_credits c JOIN tracking_orders o ON o.id=c.order_id
  WHERE c.project_id=original.project_id AND c.front_order_id=original.front_order_id
    AND c.approved_at<original.approved_at
    AND c.approved_at>=original.approved_at-interval '2 minutes'
    AND o.provider=sale.provider
    AND o.vendepay_connection_id IS NOT DISTINCT FROM sale.vendepay_connection_id
    AND o.syzepay_connection_id IS NOT DISTINCT FROM sale.syzepay_connection_id
  ORDER BY c.approved_at DESC,c.order_id DESC LIMIT 1;
  IF NOT FOUND OR prior.operator_id IS NULL OR prior.attempt_id IS NULL
    OR (expected_operator IS NOT NULL AND prior.operator_id<>expected_operator)
    OR substring(prior.stage_key from '[0-9]+')::int >= substring(original.stage_key from '[0-9]+')::int
    OR NOT upsell_operator_has_payment_proof(prior.order_id) THEN RETURN false; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM tracking_upsell_operator_attempts a
    WHERE a.id=prior.attempt_id AND a.project_id=original.project_id
      AND a.order_id=original.front_order_id AND a.provider=sale.provider
      AND a.operator_id=prior.operator_id AND NOT a.view_only AND a.opened_at<=prior.approved_at
  ) THEN RETURN false; END IF;
  IF EXISTS (
    SELECT 1 FROM tracking_upsell_operator_attempts a
    WHERE a.project_id=original.project_id AND a.order_id=original.front_order_id
      AND a.provider=sale.provider
      AND a.opened_at<=(original.approved_at)
      AND a.opened_at>=(SELECT opened_at FROM tracking_upsell_operator_attempts WHERE id=prior.attempt_id)
      AND a.operator_id<>prior.operator_id
  ) OR EXISTS (
    SELECT 1 FROM tracking_upsell_operator_credits c JOIN tracking_orders o ON o.id=c.order_id
    WHERE c.project_id=original.project_id AND c.front_order_id=original.front_order_id
      AND c.approved_at=prior.approved_at AND c.operator_id IS DISTINCT FROM prior.operator_id
      AND o.provider=sale.provider
      AND o.vendepay_connection_id IS NOT DISTINCT FROM sale.vendepay_connection_id
      AND o.syzepay_connection_id IS NOT DISTINCT FROM sale.syzepay_connection_id
  ) THEN RETURN false; END IF;

  chosen_operator := prior.operator_id;
  chosen_attempt := prior.attempt_id;
  chosen_anchor := prior.order_id;
  chosen_reason := 'same_front_paid_sequence';
  END IF;

  UPDATE tracking_upsell_operator_credits
  SET operator_id=chosen_operator,attempt_id=chosen_attempt,anchor_order_id=chosen_anchor,
      reason=chosen_reason,rule='operator_flow_v2',recorded_at=now()
  WHERE order_id=target_id RETURNING * INTO updated;
  INSERT INTO tracking_upsell_operator_credit_revisions(order_id,before_credit,after_credit)
  VALUES(target_id,to_jsonb(original),to_jsonb(updated));
  RETURN true;
END $$;

-- Also handles webhook arrival in reverse order. Each link still requires <=120s.
CREATE FUNCTION reconcile_upsell_operator_sequences_after_order(target_id text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  anchor tracking_upsell_operator_credits%ROWTYPE;
  target record;
BEGIN
  SELECT * INTO anchor FROM tracking_upsell_operator_credits WHERE order_id=target_id;
  IF NOT FOUND OR anchor.front_order_id IS NULL THEN RETURN; END IF;
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

CREATE OR REPLACE FUNCTION capture_upsell_operator_credit() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  PERFORM record_upsell_operator_credit(NEW.id);
  PERFORM reconcile_upsell_operator_sequences_after_order(NEW.id);
  RETURN NEW;
END $$;
