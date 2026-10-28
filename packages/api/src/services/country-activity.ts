import type { Sql } from 'postgres';

export const COUNTRY_ACTIVITY_VERSION = 'pre-purchase-v1';

/** Read-only aggregate. No browser IP is inferred from a gateway's webhook IP. */
export async function countryActivity(sql: Sql, offerId: string, from: Date, to: Date) {
  const rows = await sql`
    WITH events AS (
      SELECT e.* FROM tracking_events e
      JOIN tracking_projects p ON p.id=e.project_id
      WHERE p.offer_id=${offerId} AND e.received_at>=${from} AND e.received_at<${to}
        AND e.event_name IN ('AdClick','PageView','InitiateCheckout')
    ), event_counts AS (
      SELECT CASE WHEN upper(source->>'country') ~ '^[A-Z]{2}$'
        AND upper(source->>'country') NOT IN ('XX','ZZ') THEN upper(source->>'country') ELSE 'ZZ' END country,
        count(*)::int events,
        count(*) FILTER (WHERE event_name='PageView')::int page_views,
        count(*) FILTER (WHERE event_name='InitiateCheckout')::int checkouts
      FROM events GROUP BY 1
    ), purchases AS (
      SELECT o.*, coalesce(o.paid_at,o.occurred_at) purchased_at
      FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
      WHERE p.offer_id=${offerId} AND o.status='paid'
        AND coalesce(o.paid_at,o.occurred_at)>=${from} AND coalesce(o.paid_at,o.occurred_at)<${to}
    ), located AS (
      SELECT o.id, CASE
          WHEN original.country IS NOT NULL THEN original.country
          WHEN upper(o.buyer->>'country') ~ '^[A-Z]{2}$' AND upper(o.buyer->>'country') NOT IN ('XX','ZZ')
            THEN upper(o.buyer->>'country')
          ELSE 'ZZ' END country,
        CASE WHEN original.country IS NOT NULL AND checkout.journey_id IS NOT NULL THEN 'checkout_journey'
          WHEN original.country IS NOT NULL THEN 'visitor_before_purchase'
          WHEN upper(o.buyer->>'country') ~ '^[A-Z]{2}$' AND upper(o.buyer->>'country') NOT IN ('XX','ZZ') THEN 'buyer'
          ELSE 'unknown' END country_basis
      FROM purchases o
      LEFT JOIN LATERAL (
        SELECT e.journey_id FROM tracking_events e
        WHERE e.project_id=o.project_id AND e.visitor_id=o.visitor_id
          AND e.event_name='InitiateCheckout'
          AND e.received_at<=o.purchased_at AND e.received_at>=o.purchased_at-interval '30 days'
        ORDER BY e.received_at DESC,e.id DESC LIMIT 1
      ) checkout ON true
      LEFT JOIN LATERAL (
        SELECT upper(e.source->>'country') country FROM tracking_events e
        WHERE e.project_id=o.project_id AND e.visitor_id=o.visitor_id
          AND (checkout.journey_id IS NULL OR e.journey_id=checkout.journey_id)
          AND e.event_name IN ('AdClick','PageView','InitiateCheckout')
          AND e.received_at<=o.purchased_at AND e.received_at>=o.purchased_at-interval '30 days'
          AND upper(e.source->>'country') ~ '^[A-Z]{2}$' AND upper(e.source->>'country') NOT IN ('XX','ZZ')
        ORDER BY e.received_at ASC,e.id ASC LIMIT 1
      ) original ON true
    ), order_counts AS (
      SELECT country,count(*)::int paid_orders,
        count(*) FILTER (WHERE country_basis='checkout_journey')::int journey_linked,
        count(*) FILTER (WHERE country_basis='visitor_before_purchase')::int visitor_linked,
        count(*) FILTER (WHERE country_basis='buyer')::int buyer_country
      FROM located GROUP BY 1
    ) SELECT coalesce(e.country,o.country) country,coalesce(e.events,0)::int events,
      coalesce(e.page_views,0)::int page_views,coalesce(e.checkouts,0)::int checkouts,
      coalesce(o.paid_orders,0)::int paid_orders,coalesce(o.journey_linked,0)::int journey_linked,
      coalesce(o.visitor_linked,0)::int visitor_linked,coalesce(o.buyer_country,0)::int buyer_country
    FROM event_counts e FULL JOIN order_counts o ON e.country=o.country ORDER BY 1
  `;
  return {
    version: COUNTRY_ACTIVITY_VERSION,
    rows,
    generated_at: new Date().toISOString(),
    time_zone: 'America/Sao_Paulo',
  };
}
