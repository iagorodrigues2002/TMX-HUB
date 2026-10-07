import { Worker } from 'bullmq';
import postgres, { type Sql } from 'postgres';
import { ulid } from 'ulid';
import { env } from '../env.js';
import {
  type ExplodelyPayload,
  explodelyAmountMinor,
  explodelyEventId,
  explodelyEventPlan,
  normalizeExplodely,
} from '../integrations/explodely/normalize.js';
import { logger } from '../lib/logger.js';
import { makeRedis } from '../lib/redis.js';
import { EXPLODELY_QUEUE_NAME, type ExplodelyJobData } from '../queues/index.js';
import { createMetaQueue } from '../queues/meta.queue.js';
import { createTikTokQueue } from '../queues/tiktok.queue.js';
import { createUtmifyDeliveryQueue } from '../queues/utmify-delivery.queue.js';

type DeliveryIds = { meta: string[]; tiktok: string[]; utmify: string[] };

const emptyDeliveries = (): DeliveryIds => ({ meta: [], tiktok: [], utmify: [] });

function configuredCurrency(settings: Record<string, unknown>, payloadCurrency: string | null) {
  const candidate =
    payloadCurrency ??
    (typeof settings.currency === 'string' ? settings.currency.trim().toUpperCase() : null);
  return candidate && /^[A-Z]{3}$/.test(candidate) ? candidate : null;
}

export async function processExplodelyReceipt(db: Sql, receiptId: string): Promise<DeliveryIds> {
  return db.begin(async (sql) => {
    const [receipt] = await sql<
      Array<{
        id: string;
        payload: ExplodelyPayload;
        raw_payload: string;
        received_at: Date;
        state: string;
      }>
    >`
      SELECT id,payload,raw_payload,received_at,state
      FROM tracking_gateway_webhook_receipts
      WHERE id=${receiptId}
      FOR UPDATE
    `;
    if (!receipt || receipt.state !== 'received') return emptyDeliveries();
    const rawBody = Buffer.from(receipt.raw_payload, 'utf8');
    const normalized = normalizeExplodely(receipt.payload, rawBody, receipt.received_at);
    if (normalized.kind === 'quarantined') {
      await sql`
        UPDATE tracking_gateway_webhook_receipts
        SET state='quarantined',diagnostics=${sql.json(normalized.diagnostics)},processed_at=now()
        WHERE id=${receiptId}
      `;
      await sql`
        UPDATE webhook_receipts
        SET state='quarantined',diagnostics=${sql.json(normalized.diagnostics)},processed_at=now()
        WHERE id=${receiptId}
      `;
      return emptyDeliveries();
    }
    const event = normalized.event;
    const [connection] = await sql<
      Array<{
        id: string;
        project_id: string;
        offer_id: string;
        settings: Record<string, unknown>;
      }>
    >`
      SELECT g.id,g.project_id,p.offer_id,g.settings
      FROM tracking_gateway_connections g
      JOIN tracking_projects p ON p.id=g.project_id
      WHERE g.provider='explodely' AND g.enabled=true
        AND (
          (${event.vendorId}::text IS NOT NULL AND COALESCE(g.settings->>'vendor_id',g.settings->>'vendorId')=${event.vendorId})
          OR
          (${event.sellerId}::text IS NOT NULL AND COALESCE(g.settings->>'seller_id',g.settings->>'sellerId')=${event.sellerId})
        )
      ORDER BY CASE
        WHEN ${event.vendorId}::text IS NOT NULL AND COALESCE(g.settings->>'vendor_id',g.settings->>'vendorId')=${event.vendorId} THEN 0
        ELSE 1
      END,g.created_at
      LIMIT 1
    `;
    if (!connection) {
      const diagnostics = [...normalized.diagnostics, 'gateway_connection_not_matched'];
      await sql`
        UPDATE tracking_gateway_webhook_receipts
        SET state='unmatched',diagnostics=${sql.json(diagnostics)},processed_at=now()
        WHERE id=${receiptId}
      `;
      await sql`
        UPDATE webhook_receipts
        SET state='unmatched',diagnostics=${sql.json(diagnostics)},processed_at=now()
        WHERE id=${receiptId}
      `;
      logger.warn(
        { receiptId, vendorId: event.vendorId, sellerId: event.sellerId },
        'Explodely webhook did not match an enabled gateway connection',
      );
      return emptyDeliveries();
    }

    const [visitor] = event.trackingId
      ? await sql<Array<{ visitor_id: string; source: Record<string, string> }>>`
          SELECT visitor_id,first_source || last_source AS source
          FROM tracking_visitors
          WHERE project_id=${connection.project_id}
            AND (visitor_id=${event.trackingId} OR tracking_token=${event.trackingId})
          ORDER BY last_seen_at DESC LIMIT 1
        `
      : [];
    const visitorId =
      visitor?.visitor_id ?? `explodely:${explodelyEventId(event.transactionId).slice(10, 42)}`;
    const attribution = {
      ...(visitor?.source ?? {}),
      ...event.source,
      ...(event.vendorId ? { vendor_id: event.vendorId } : {}),
      ...(event.sellerId ? { seller_id: event.sellerId } : {}),
      ...(event.trackingId ? { explodely_tracking_id: event.trackingId } : {}),
    };
    const currency = configuredCurrency(connection.settings, event.currency);
    const amountMinor = currency ? explodelyAmountMinor(event.amount, connection.settings) : null;
    const plan = explodelyEventPlan(event.kind);
    const [productKind] =
      typeof event.product.id === 'string'
        ? await sql<Array<{ kind: string }>>`
          SELECT kind FROM tracking_product_kinds
          WHERE project_id=${connection.project_id} AND product_id=${event.product.id}
          LIMIT 1
        `
        : [];
    const configuredKind =
      typeof connection.settings.order_kind === 'string' ? connection.settings.order_kind : null;
    const orderKind =
      productKind?.kind ?? configuredKind ?? (event.kind === 'sale' ? 'front' : 'unknown');
    let order: { id: string; status: string; order_kind: string } | undefined;

    if (plan.orderAction === 'upsert') {
      [order] = await sql<Array<{ id: string; status: string; order_kind: string }>>`
        INSERT INTO tracking_orders
          (id,project_id,provider,external_id,status,amount_minor,currency,visitor_id,buyer,
           raw_status,occurred_at,paid_at,product,attribution_source,order_kind,
           gateway_connection_id)
        VALUES(${ulid()},${connection.project_id},'explodely',${event.externalId},'paid',
          ${amountMinor},${currency},${visitor?.visitor_id ?? null},${sql.json(event.buyer)},
          ${event.rawStatus},${event.occurredAt},${event.occurredAt},${sql.json(event.product as never)},
          ${sql.json(attribution)},${orderKind},${connection.id})
        ON CONFLICT(project_id,provider,external_id) DO UPDATE SET
          status=CASE WHEN tracking_orders.status IN ('refunded','chargeback','cancelled')
            THEN tracking_orders.status ELSE 'paid' END,
          amount_minor=COALESCE(EXCLUDED.amount_minor,tracking_orders.amount_minor),
          currency=COALESCE(EXCLUDED.currency,tracking_orders.currency),
          visitor_id=COALESCE(EXCLUDED.visitor_id,tracking_orders.visitor_id),
          buyer=tracking_orders.buyer || EXCLUDED.buyer,
          raw_status=EXCLUDED.raw_status,
          paid_at=COALESCE(tracking_orders.paid_at,EXCLUDED.paid_at),
          product=tracking_orders.product || EXCLUDED.product,
          attribution_source=tracking_orders.attribution_source || EXCLUDED.attribution_source,
          order_kind=CASE WHEN tracking_orders.order_kind='unknown' THEN EXCLUDED.order_kind
            ELSE tracking_orders.order_kind END,
          gateway_connection_id=EXCLUDED.gateway_connection_id,updated_at=now()
        RETURNING id,status,order_kind
      `;
    } else if (plan.orderAction === 'update') {
      const lifecycleColumn =
        event.kind === 'refund'
          ? 'refunded_at'
          : event.kind === 'chargeback'
            ? 'chargeback_at'
            : 'cancelled_at';
      [order] = await sql<Array<{ id: string; status: string; order_kind: string }>>`
        UPDATE tracking_orders
        SET status=${plan.status},
            refunded_at=CASE WHEN ${lifecycleColumn}='refunded_at' THEN COALESCE(refunded_at,${event.occurredAt}) ELSE refunded_at END,
            chargeback_at=CASE WHEN ${lifecycleColumn}='chargeback_at' THEN COALESCE(chargeback_at,${event.occurredAt}) ELSE chargeback_at END,
            cancelled_at=CASE WHEN ${lifecycleColumn}='cancelled_at' THEN COALESCE(cancelled_at,${event.occurredAt}) ELSE cancelled_at END,
            raw_status=${event.rawStatus},gateway_connection_id=${connection.id},updated_at=now()
        WHERE project_id=${connection.project_id} AND provider='explodely'
          AND external_id=${event.externalId}
        RETURNING id,status,order_kind
      `;
      if (!order) {
        const diagnostics = [...normalized.diagnostics, 'original_order_not_found'];
        await sql`
          UPDATE tracking_gateway_webhook_receipts
          SET gateway_connection_id=${connection.id},state='unmatched',diagnostics=${sql.json(diagnostics)},processed_at=now()
          WHERE id=${receiptId}
        `;
        await sql`
          UPDATE webhook_receipts
          SET gateway_connection_id=${connection.id},state='unmatched',diagnostics=${sql.json(diagnostics)},processed_at=now()
          WHERE id=${receiptId}
        `;
        return emptyDeliveries();
      }
    }

    const eventId = explodelyEventId(event.transactionId);
    await sql`
      INSERT INTO tracking_events
        (id,project_id,visitor_id,event_name,event_url,event_category,source,properties,
         client_ip,client_at)
      VALUES(${eventId},${connection.project_id},${visitorId},${plan.trackingEvent},
        ${event.source.event_url ?? 'https://theminex.com/'},'commerce',${sql.json(attribution)},
        ${sql.json({
          provider: 'explodely',
          transaction_id: event.externalId,
          recurring: plan.recurring,
          order_id: order?.id ?? null,
        })},${event.buyer.ip ?? null},${event.occurredAt})
      ON CONFLICT(project_id,id) DO NOTHING
    `;
    await sql`
      UPDATE tracking_gateway_webhook_receipts
      SET gateway_connection_id=${connection.id},state='processed',order_id=${order?.id ?? null},
          diagnostics=${sql.json(normalized.diagnostics)},processed_at=now()
      WHERE id=${receiptId}
    `;
    await sql`
      UPDATE webhook_receipts
      SET gateway_connection_id=${connection.id},state='processed',order_id=${order?.id ?? null},
          diagnostics=${sql.json(normalized.diagnostics)},processed_at=now()
      WHERE id=${receiptId}
    `;
    await sql`
      UPDATE tracking_gateway_connections SET last_webhook_at=now(),updated_at=now()
      WHERE id=${connection.id}
    `;

    if (!order) return emptyDeliveries();
    const deliveries = emptyDeliveries();
    for (const destination of await sql<Array<{ id: string }>>`
      SELECT id FROM tracking_utmify_destinations
      WHERE enabled=true AND (project_id=${connection.project_id} OR (
        scope='global' AND COALESCE((
          SELECT enabled FROM tracking_utmify_global_offer_routes
          WHERE project_id=${connection.project_id}
        ),true)=true
      ))
    `) {
      const [row] = await sql<Array<{ id: string }>>`
        INSERT INTO tracking_delivery_outbox
          (id,project_id,destination_kind,destination_id,order_id,event_id,event_type,state)
        VALUES(${ulid()},${connection.project_id},'utmify',${destination.id},${order.id},
          ${eventId},${`order.${order.status}`},${order.status === 'cancelled' ? 'skipped' : 'pending'})
        ON CONFLICT(destination_kind,destination_id,event_id) DO NOTHING RETURNING id
      `;
      if (row) deliveries.utmify.push(row.id);
    }
    if (order.status !== 'paid' || order.order_kind !== 'front') return deliveries;
    for (const pixel of await sql<Array<{ id: string }>>`
      SELECT id FROM meta_pixels
      WHERE project_id=${connection.project_id} AND enabled=true
        AND (NOT EXISTS (SELECT 1 FROM meta_pixel_products WHERE pixel_id=meta_pixels.id)
          OR ${typeof event.product.id === 'string' ? event.product.id : null}::text IN (
            SELECT product_id FROM meta_pixel_products WHERE pixel_id=meta_pixels.id
          ))
    `) {
      const [row] = await sql<Array<{ id: string }>>`
        INSERT INTO meta_deliveries(id,project_id,pixel_id,order_id,event_id)
        VALUES(${ulid()},${connection.project_id},${pixel.id},${order.id},${eventId})
        ON CONFLICT(pixel_id,event_id) DO NOTHING RETURNING id
      `;
      if (row) deliveries.meta.push(row.id);
    }
    for (const destination of await sql<Array<{ id: string }>>`
      SELECT id FROM tracking_tiktok_destinations
      WHERE project_id=${connection.project_id} AND enabled=true
    `) {
      const [row] = await sql<Array<{ id: string }>>`
        INSERT INTO tracking_tiktok_deliveries
          (id,project_id,destination_id,order_id,event_id,event_name)
        VALUES(${ulid()},${connection.project_id},${destination.id},${order.id},${eventId},'Purchase')
        ON CONFLICT(destination_id,event_id) DO NOTHING RETURNING id
      `;
      if (row) deliveries.tiktok.push(row.id);
    }
    return deliveries;
  });
}

export function createExplodelyWorker(): Worker<ExplodelyJobData> | null {
  if (!env.DATABASE_URL) return null;
  const db = postgres(env.DATABASE_URL, {
    max: 3,
    ssl: env.NODE_ENV === 'production' ? 'require' : false,
  });
  const metaQueue = createMetaQueue(env.REDIS_URL);
  const tiktokQueue = createTikTokQueue(env.REDIS_URL);
  const utmifyQueue = createUtmifyDeliveryQueue(env.REDIS_URL);
  const worker = new Worker<ExplodelyJobData>(
    EXPLODELY_QUEUE_NAME,
    async (job) => {
      const deliveries = await processExplodelyReceipt(db, job.data.receiptId);
      await Promise.allSettled([
        ...deliveries.meta.map((deliveryId) => metaQueue.add('send', { deliveryId })),
        ...deliveries.tiktok.map((deliveryId) => tiktokQueue.add('send', { deliveryId })),
        ...deliveries.utmify.map((deliveryId) => utmifyQueue.add('send', { deliveryId })),
      ]);
    },
    {
      connection: makeRedis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      }),
      concurrency: 8,
    },
  );
  worker.on('closed', () => {
    void Promise.all([db.end(), metaQueue.close(), tiktokQueue.close(), utmifyQueue.close()]);
  });
  return worker;
}
