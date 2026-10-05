-- Keep the Upsell Intelligence reads bounded as order and event volume grows.
-- These indexes mirror the project, period and buyer-identity predicates used
-- by the dashboard; they do not alter tracking data or delivery behaviour.
CREATE INDEX IF NOT EXISTS tracking_orders_project_kind_paid_idx
  ON tracking_orders(project_id, order_kind, paid_at DESC)
  WHERE paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS tracking_orders_project_visitor_paid_idx
  ON tracking_orders(project_id, visitor_id, paid_at DESC)
  WHERE visitor_id IS NOT NULL AND paid_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS tracking_orders_project_email_paid_idx
  ON tracking_orders(project_id, lower(trim(buyer->>'email')), paid_at DESC)
  WHERE paid_at IS NOT NULL AND NULLIF(trim(buyer->>'email'), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS tracking_orders_project_phone_paid_idx
  ON tracking_orders(project_id, regexp_replace(buyer->>'phone', '\D', '', 'g'), paid_at DESC)
  WHERE paid_at IS NOT NULL
    AND NULLIF(regexp_replace(buyer->>'phone', '\D', '', 'g'), '') IS NOT NULL;

CREATE INDEX IF NOT EXISTS tracking_events_upsell_stage_idx
  ON tracking_events(project_id, event_name, (properties->>'upsell_stage_id'), received_at DESC)
  WHERE event_name IN (
    'UpsellPageView', 'UpsellOfferView', 'UpsellAcceptClick',
    'UpsellDeclineClick', 'UpsellExit', 'UpsellPageError'
  );

CREATE INDEX IF NOT EXISTS tracking_upsell_manual_results_order_stage_idx
  ON tracking_upsell_manual_test_results(project_id, order_id, stage_id, checked_at DESC);
