import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';

export function createUpsellDestinationForAccountContext(app: FastifyInstance) {
  async function upsellDestinationForAccount(
    stage: {
      project_id: string;
      destination_url: string;
      connection_destinations: Record<string, string> | null;
    },
    vendaId?: string,
  ) {
    if (!app.db || !vendaId) return stage.destination_url;
    const [order] = await app.db<Array<{ vendepay_connection_id: string | null }>>`
      SELECT o.vendepay_connection_id
      FROM tracking_orders o
      WHERE o.project_id=${stage.project_id} AND o.provider='vendepay'
        AND o.order_kind='front' AND o.paid_at IS NOT NULL
        AND (
          o.external_id=${vendaId}
          OR EXISTS (
            SELECT 1
            FROM webhook_receipts wr
            WHERE wr.order_id=o.id
              AND jsonb_path_exists(
                wr.payload,
                '$.** ? (@ == $vendid)',
                jsonb_build_object('vendid', ${vendaId}::text)
              )
          )
        )
      ORDER BY o.paid_at DESC LIMIT 1
    `;
    if (order?.vendepay_connection_id) {
      return (
        stage.connection_destinations?.[order.vendepay_connection_id] ||
        stage.connection_destinations?.['gateway:vendepay'] ||
        null
      );
    }
    return stage.destination_url;
  }

  async function hasConfirmedUpsellIdentity(projectId: string, vendaId?: string) {
    if (!app.db || !vendaId) return false;
    const hash = createHash('sha256').update(vendaId).digest('hex');
    const [identity] = await app.db<Array<{ found: number }>>`
      SELECT 1 AS found FROM tracking_upsell_identities
      WHERE project_id=${projectId} AND vendid_hash=${hash}
      LIMIT 1
    `;
    return Boolean(identity);
  }
  return { upsellDestinationForAccount, hasConfirmedUpsellIdentity };
}
