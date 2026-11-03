import type { Sql } from 'postgres';

export type SalesView = 'general' | 'natural';

/** Same frozen operational classification in every read model; alias o, never ad attribution. */
export function naturalSale(sql: Sql) {
  // Static SQL only: unsafe creates a composable fragment without executing the retry-wrapped tag.
  return sql.unsafe(`(o.paid_at IS NOT NULL AND CASE WHEN o.order_kind='front' THEN NOT EXISTS (
      SELECT 1 FROM tracking_upsell_operator_attempts a
      WHERE a.project_id=o.project_id AND a.order_id=o.id AND NOT a.view_only AND a.opened_at<=o.paid_at)
    WHEN o.order_kind='upsell' OR o.order_kind ~ '^upsell_[0-9]+$' THEN EXISTS (
      SELECT 1 FROM tracking_upsell_operator_credits c WHERE c.order_id=o.id AND c.project_id=o.project_id
        AND c.operator_id IS NULL AND c.reason='no_preapproval_click' AND c.front_order_id IS NOT NULL)
    ELSE false END)`);
}

export function saleOriginFilter(sql: Sql, view: SalesView = 'general') {
  return view === 'natural' ? naturalSale(sql) : true;
}

export function refundOriginFilter(sql: Sql, view: 'general' | 'natural' | 'assisted') {
  if (view !== 'assisted') return saleOriginFilter(sql, view);
  return sql.unsafe(`(o.paid_at IS NOT NULL AND CASE WHEN o.order_kind='front' THEN EXISTS (
    SELECT 1 FROM tracking_upsell_operator_attempts a
    WHERE a.project_id=o.project_id AND a.order_id=o.id AND NOT a.view_only AND a.opened_at<=o.paid_at)
    WHEN o.order_kind='upsell' OR o.order_kind ~ '^upsell_[0-9]+$' THEN EXISTS (
    SELECT 1 FROM tracking_upsell_operator_credits c WHERE c.order_id=o.id AND c.project_id=o.project_id
      AND c.operator_id IS NOT NULL)
    ELSE false END)`);
}
