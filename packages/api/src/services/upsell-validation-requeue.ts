import type { Sql } from 'postgres';

export async function requeueConfiguredUpsells(sql: Sql) {
  return sql`
    UPDATE tracking_upsell_identity_validation q
    SET state='pending',attempts=0,last_error=NULL,next_attempt_at=now(),
        lease_until=NULL,lease_token=NULL,updated_at=now()
    FROM tracking_orders o
    JOIN vendepay_connections vc ON vc.id=o.vendepay_connection_id AND vc.enabled=true
    WHERE q.order_id=o.id AND q.state IN ('failed','retry')
      AND q.last_error='account_destination_not_configured'
      AND o.status='paid' AND o.order_kind='front'
      AND o.provider='vendepay' AND vc.payload_adapter='vendepay'
      AND NOT EXISTS(SELECT 1 FROM tracking_upsell_identities i
        WHERE i.project_id=o.project_id AND i.source_order_id=o.id)
      AND EXISTS(
        SELECT 1 FROM (
          SELECT s.destination_url,s.connection_destinations FROM tracking_upsell_stages s
          WHERE s.project_id=o.project_id AND s.enabled=true ORDER BY s.id LIMIT 5
        ) s
        WHERE NULLIF(CASE WHEN COALESCE(s.connection_destinations,'{}'::jsonb)='{}'::jsonb
          THEN s.destination_url ELSE s.connection_destinations->>o.vendepay_connection_id END,'') IS NOT NULL
      )
    RETURNING q.order_id
  `;
}
