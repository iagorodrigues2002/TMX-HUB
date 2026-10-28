import type { Sql } from 'postgres';

export async function funnelActivity(sql: Sql, offerId: string, from: Date, to: Date) {
  const [counts] = await sql`
    WITH entrants AS (
      SELECT e.project_id,e.visitor_id,min(e.received_at) entered_at
      FROM tracking_events e JOIN tracking_projects p ON p.id=e.project_id
      WHERE p.offer_id=${offerId} AND e.event_name='AdClick'
        AND e.received_at>=${from} AND e.received_at<${to}
      GROUP BY e.project_id,e.visitor_id
    ), linked AS (
      SELECT e.*, checkout.started_at,
        EXISTS(SELECT 1 FROM tracking_orders o
          WHERE o.project_id=e.project_id AND o.visitor_id=e.visitor_id
            AND o.status='paid' AND o.order_kind='front'
            AND coalesce(o.paid_at,o.occurred_at)>=checkout.started_at
            AND coalesce(o.paid_at,o.occurred_at)<${to}) purchased
      FROM entrants e LEFT JOIN LATERAL (
        SELECT min(c.received_at) started_at FROM tracking_events c
        WHERE c.project_id=e.project_id AND c.visitor_id=e.visitor_id
          AND c.event_name='InitiateCheckout' AND c.received_at>=e.entered_at AND c.received_at<${to}
      ) checkout ON true
    ) SELECT count(*)::int entrants,
      count(*) FILTER(WHERE started_at IS NOT NULL)::int checkouts,
      count(*) FILTER(WHERE purchased)::int buyers FROM linked
  `;
  return { version: 'visitor-cohort-v1', ...counts };
}
