import { createHash, createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { normalizePaysight } from '../../integrations/paysight/normalize.js';
import { webhookPayloadForStorage } from '../../lib/webhook-payload.js';
import { WEBHOOK_RATE_LIMIT } from '../../plugins/rate-limit.js';
import { invalidateOfferAnalytics } from './browser-request.js';
import { captureRawWebhookBody, verifyGatewayWebhook } from './webhook-security.js';

export function registerGetWebhooksVendepayRoutes(app: FastifyInstance) {
  // Explodely's legacy IPN can use GET on the historic VendePay URL. Reuse
  // the POST pipeline so token/HMAC verification, deduplication and delivery
  // behavior stay identical.
  app.get<{ Querystring: Record<string, string | undefined> }>(
    '/webhooks/vendepay',
    { logLevel: 'silent' },
    async (req, reply) => {
      const result = await app.inject({
        method: 'POST',
        url: req.raw.url,
        payload: req.query,
      });
      const contentType = result.headers['content-type'];
      if (contentType) reply.header('content-type', contentType);
      return reply.code(result.statusCode).send(result.json());
    },
  );

  // Generic payment gateway receiver. VendePay intentionally keeps its mature
  // route above; new processors (starting with Paysight) use this isolated
  // connection model so enabling them cannot alter VendePay ingestion.
  app.post<{ Querystring: { token?: string } }>(
    '/webhooks/paysight',
    {
      bodyLimit: 256 * 1024,
      logLevel: 'silent',
      preParsing: captureRawWebhookBody,
      config: { rateLimit: WEBHOOK_RATE_LIMIT },
    },
    async (req, reply) => {
      if (!app.db || !req.query.token) return reply.code(404).send({ accepted: false });
      const candidate = createHash('sha256').update(req.query.token).digest('hex');
      const [connection] = await app.db<
        Array<{
          id: string;
          project_id: string;
          offer_id: string;
          signing_secret_encrypted: string | null;
        }>
      >`
        SELECT g.id,g.project_id,p.offer_id,g.signing_secret_encrypted
        FROM tracking_gateway_connections g
        JOIN tracking_projects p ON p.id=g.project_id
        WHERE g.provider='paysight' AND g.enabled=true AND g.webhook_token_hash=${candidate}
        LIMIT 1
      `;
      if (!connection) return reply.code(404).send({ accepted: false });
      const signature = verifyGatewayWebhook({
        provider: 'paysight',
        request: req,
        encryptedSecret: connection.signing_secret_encrypted,
      });
      if (!signature.accepted) {
        return reply.code(401).send({ accepted: false, error: signature.error });
      }
      if (Array.isArray(req.body) && req.body.length > 1) {
        // Paysight batches transactions. Re-enter the same idempotent handler
        // per element so each transaction gets its own durable receipt/order.
        const results = await Promise.all(
          req.body.map((payload) => {
            const rawPayload = JSON.stringify(payload);
            return app.inject({
              method: 'POST',
              url: req.raw.url,
              headers: {
                'content-type': 'application/json',
                ...(signature.secret
                  ? {
                      'x-paysight-signature': createHmac('sha256', signature.secret)
                        .update(rawPayload)
                        .digest('hex'),
                    }
                  : {}),
              },
              payload: rawPayload,
            });
          }),
        );
        return reply.code(200).send({ accepted: true, received: results.length });
      }
      // Paysight delivers a batch (array) even when it contains one event.
      // The durable receipt is per transaction, never per HTTP batch.
      const incoming = Array.isArray(req.body) ? req.body : [req.body];
      const payload = incoming[0];
      const normalized = normalizePaysight(payload);
      const receiptPayload = webhookPayloadForStorage(payload, env.WEBHOOK_PAYLOAD_SCRUB);
      const receiptId = ulid();
      if (normalized.kind === 'quarantined') {
        await app.db`
          INSERT INTO tracking_gateway_webhook_receipts
            (id,gateway_connection_id,dedupe_key,payload,state,diagnostics)
          VALUES(${receiptId},${connection.id},${normalized.dedupeKey},${app.db.json(receiptPayload as never)},'quarantined',${app.db.json(normalized.diagnostics)})
          ON CONFLICT(gateway_connection_id,dedupe_key) DO NOTHING
        `;
        return reply.code(200).send({ accepted: true, state: 'quarantined' });
      }
      const event = normalized.event;
      const outcome = await app.db.begin(async (sql) => {
        const receipt = await sql`
          INSERT INTO tracking_gateway_webhook_receipts
            (id,gateway_connection_id,dedupe_key,payload,state)
          VALUES(${receiptId},${connection.id},${normalized.dedupeKey},${sql.json(receiptPayload as never)},'received')
          ON CONFLICT(gateway_connection_id,dedupe_key) DO NOTHING RETURNING id
        `;
        if (!receipt[0])
          return {
            duplicate: true,
            meta: [] as string[],
            utmify: [] as string[],
            tiktok: [] as string[],
          };
        const [visitor] = event.trackingSrc
          ? await sql<Array<{ visitor_id: string }>>`
              SELECT visitor_id FROM tracking_visitors
              WHERE project_id=${connection.project_id} AND (visitor_id=${event.trackingSrc} OR tracking_token=${event.trackingSrc})
              ORDER BY last_seen_at DESC LIMIT 1
            `
          : [];
        const [productKind] = event.product.id
          ? await sql<
              Array<{ kind: string }>
            >`SELECT kind FROM tracking_product_kinds WHERE project_id=${connection.project_id} AND product_id=${event.product.id} LIMIT 1`
          : [];
        const [visitorSource] = visitor
          ? await sql<
              Array<{ first_source: Record<string, string>; last_source: Record<string, string> }>
            >`
              SELECT first_source,last_source FROM tracking_visitors WHERE project_id=${connection.project_id} AND visitor_id=${visitor.visitor_id} LIMIT 1
            `
          : [];
        const attribution = {
          ...(visitorSource?.first_source ?? {}),
          ...(visitorSource?.last_source ?? {}),
          ...event.source,
        };
        const [order] = await sql<Array<{ id: string; status: string; order_kind: string }>>`
          INSERT INTO tracking_orders
            (id,project_id,provider,external_id,status,amount_minor,currency,visitor_id,buyer,raw_status,occurred_at,paid_at,payment_method,product,attribution_source,order_kind,refunded_at,chargeback_at,gateway_connection_id)
          VALUES(${ulid()},${connection.project_id},'paysight',${event.transactionId},${event.status},${event.amountMinor ?? null},${event.currency ?? null},${visitor?.visitor_id ?? null},${sql.json(event.buyer)},${event.rawStatus ?? null},${event.occurredAt},${event.status === 'paid' ? event.occurredAt : null},${event.paymentMethod ?? null},${sql.json(event.product)},${sql.json(attribution)},${productKind?.kind ?? 'unknown'},${event.status === 'refunded' ? event.occurredAt : null},${event.status === 'chargeback' ? event.occurredAt : null},${connection.id})
          ON CONFLICT(project_id,provider,external_id) DO UPDATE SET
            status=CASE WHEN tracking_orders.status IN ('refunded','chargeback') THEN tracking_orders.status WHEN tracking_orders.status='paid' AND EXCLUDED.status IN ('pending','refused','unknown') THEN tracking_orders.status ELSE EXCLUDED.status END,
            amount_minor=COALESCE(EXCLUDED.amount_minor,tracking_orders.amount_minor), currency=COALESCE(EXCLUDED.currency,tracking_orders.currency),
            visitor_id=COALESCE(EXCLUDED.visitor_id,tracking_orders.visitor_id), buyer=tracking_orders.buyer || EXCLUDED.buyer,
            raw_status=COALESCE(EXCLUDED.raw_status,tracking_orders.raw_status), payment_method=COALESCE(EXCLUDED.payment_method,tracking_orders.payment_method),
            product=tracking_orders.product || EXCLUDED.product, attribution_source=tracking_orders.attribution_source || EXCLUDED.attribution_source,
            paid_at=CASE WHEN EXCLUDED.status='paid' THEN COALESCE(tracking_orders.paid_at,EXCLUDED.paid_at) ELSE tracking_orders.paid_at END,
            refunded_at=CASE WHEN EXCLUDED.status='refunded' THEN COALESCE(tracking_orders.refunded_at,EXCLUDED.refunded_at) ELSE tracking_orders.refunded_at END,
            chargeback_at=CASE WHEN EXCLUDED.status='chargeback' THEN COALESCE(tracking_orders.chargeback_at,EXCLUDED.chargeback_at) ELSE tracking_orders.chargeback_at END,
            gateway_connection_id=EXCLUDED.gateway_connection_id,updated_at=now()
          RETURNING id,status,order_kind
        `;
        await sql`UPDATE tracking_gateway_webhook_receipts SET state='processed',order_id=${order!.id},processed_at=now() WHERE id=${receiptId}`;
        await sql`UPDATE tracking_gateway_connections SET last_webhook_at=now(),updated_at=now() WHERE id=${connection.id}`;
        const utmifyDestinations = await sql<Array<{ id: string }>>`
          SELECT id FROM tracking_utmify_destinations
          WHERE enabled=true AND (project_id=${connection.project_id} OR (
            scope='global' AND COALESCE((
              SELECT r.enabled FROM tracking_utmify_global_offer_routes r
              WHERE r.project_id=${connection.project_id}
            ),true)=true
          ))
        `;
        const utmifyRows =
          utmifyDestinations.length === 0
            ? []
            : await sql<Array<{ id: string }>>`
            INSERT INTO tracking_delivery_outbox(id,project_id,destination_kind,destination_id,order_id,event_id,event_type,state)
            SELECT batch.id,${connection.project_id},'utmify',batch.destination_id,${order!.id},${`paysight:${event.transactionId}:${event.status}`},${`order.${event.status}`},${event.status === 'cancelled' || event.status === 'abandoned' ? 'skipped' : 'pending'}
            FROM unnest(
              ${sql.array(utmifyDestinations.map(() => ulid()))}::text[],
              ${sql.array(utmifyDestinations.map((destination) => destination.id))}::text[]
            ) AS batch(id, destination_id)
            ON CONFLICT(destination_kind,destination_id,event_id) DO NOTHING RETURNING id`;
        const utmify = utmifyRows.map((row) => row.id);
        if (order!.status !== 'paid' || order!.order_kind !== 'front')
          return { duplicate: false, meta: [] as string[], utmify, tiktok: [] as string[] };
        const pixels = await sql<
          Array<{ id: string }>
        >`SELECT id FROM meta_pixels WHERE project_id=${connection.project_id} AND enabled=true AND (NOT EXISTS (SELECT 1 FROM meta_pixel_products mpp WHERE mpp.pixel_id=meta_pixels.id) OR ${event.product.id ?? null}::text IN (SELECT mpp.product_id FROM meta_pixel_products mpp WHERE mpp.pixel_id=meta_pixels.id))`;
        const metaRows =
          pixels.length === 0
            ? []
            : await sql<
                Array<{ id: string }>
              >`INSERT INTO meta_deliveries(id,project_id,pixel_id,order_id,event_id)
            SELECT batch.id,${connection.project_id},batch.pixel_id,${order!.id},${`paysight:${event.transactionId}:purchase`}
            FROM unnest(
              ${sql.array(pixels.map(() => ulid()))}::text[],
              ${sql.array(pixels.map((pixel) => pixel.id))}::text[]
            ) AS batch(id, pixel_id)
            ON CONFLICT(pixel_id,event_id) DO NOTHING RETURNING id`;
        const meta = metaRows.map((row) => row.id);
        const tikTokDestinations = await sql<
          Array<{ id: string }>
        >`SELECT id FROM tracking_tiktok_destinations WHERE project_id=${connection.project_id} AND enabled=true`;
        const tiktokRows =
          tikTokDestinations.length === 0
            ? []
            : await sql<
                Array<{ id: string }>
              >`INSERT INTO tracking_tiktok_deliveries(id,project_id,destination_id,order_id,event_id,event_name)
            SELECT batch.id,${connection.project_id},batch.destination_id,${order!.id},${`paysight:${event.transactionId}:tiktok:purchase`},'Purchase'
            FROM unnest(
              ${sql.array(tikTokDestinations.map(() => ulid()))}::text[],
              ${sql.array(tikTokDestinations.map((destination) => destination.id))}::text[]
            ) AS batch(id, destination_id)
            ON CONFLICT(destination_id,event_id) DO NOTHING RETURNING id`;
        const tiktok = tiktokRows.map((row) => row.id);
        return { duplicate: false, meta, utmify, tiktok };
      });
      if (!outcome.duplicate) {
        await invalidateOfferAnalytics(app, connection.offer_id);
      }
      await Promise.allSettled(
        outcome.meta.map((id) => app.metaQueue.add('send', { deliveryId: id })),
      );
      await Promise.allSettled(
        outcome.utmify.map((id) => app.utmifyDeliveryQueue.add('send', { deliveryId: id })),
      );
      await Promise.allSettled(
        outcome.tiktok.map((id) => app.tiktokQueue.add('send', { deliveryId: id })),
      );
      return reply.code(200).send({ accepted: true, duplicate: outcome.duplicate });
    },
  );
}
