import type { FastifyInstance } from 'fastify';
import { finalizeVendepayOrder } from './vendepay-finalize-order.js';
import type { VendepayIngestion } from './vendepay-ingestion-types.js';
import { upsertVendepayOrder } from './vendepay-upsert-order.js';
export async function processVendepayReceipt(
  app: FastifyInstance,
  context: VendepayIngestion,
  funnelName: string | null,
): Promise<{
  inserted: boolean;
  deliveryIds: string[];
  utmifyDeliveryIds: string[];
  pushcutDeliveryIds: string[];
  tiktokDeliveryIds?: string[];
}> {
  const { receiptId, connection } = context;
  return app.db!.begin(async (sql) => {
    const receipts = await sql<{ id: string }[]>`
          SELECT id FROM webhook_receipts
          WHERE id=${receiptId} AND connection_id=${connection.id}
            AND state IN ('received','failed') AND processed_at IS NULL
          FOR UPDATE
        `;
    if (receipts.length === 0) {
      return {
        inserted: false,
        deliveryIds: [] as string[],
        utmifyDeliveryIds: [] as string[],
        pushcutDeliveryIds: [] as string[],
      };
    }
    const persisted = await upsertVendepayOrder({ ...context, sql });
    const { order } = persisted;

    if (!order) {
      return {
        inserted: true,
        deliveryIds: [],
        utmifyDeliveryIds: [],
        pushcutDeliveryIds: [],
        tiktokDeliveryIds: [],
      };
    }
    return finalizeVendepayOrder({ ...context, ...persisted, sql, order, funnelName });
  });
}
