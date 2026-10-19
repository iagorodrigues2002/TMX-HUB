import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { normalizeVendepayWebhook } from '../../integrations/vendepay/explodely-compat.js';
import { decryptSecret, encryptSecret } from '../../lib/secret-box.js';
import { webhookPayloadForStorage } from '../../lib/webhook-payload.js';
import { WEBHOOK_RATE_LIMIT } from '../../plugins/rate-limit.js';
import { convertToBrlMinor } from '../../services/exchange-rate.js';
import { invalidateOfferAnalytics } from './browser-request.js';
import type { VendepayConnection } from './vendepay-ingestion-types.js';
import { processVendepayReceipt } from './vendepay-process-receipt.js';
import { captureRawWebhookBody, tokenHash, verifyGatewayWebhook } from './webhook-security.js';
import { provisionYoutubeRewardsAccount, resolveYoutubeRewardsOffer } from './youtube-rewards.js';

export function registerPostWebhooksVendepayRoutes(app: FastifyInstance) {
  app.post<{ Querystring: { token?: string } }>(
    '/webhooks/vendepay',
    {
      bodyLimit: 256 * 1024,
      logLevel: 'silent',
      preParsing: captureRawWebhookBody,
      config: { rateLimit: WEBHOOK_RATE_LIMIT },
    },
    async (req, reply) => {
      if (!app.db) return reply.code(404).send({ accepted: false });
      const workerReceiptHeader = req.headers['x-tmx-vendepay-receipt'];
      const workerSignatureHeader = req.headers['x-tmx-vendepay-signature'];
      const workerReceiptId = typeof workerReceiptHeader === 'string' ? workerReceiptHeader : null;
      const workerSignature =
        typeof workerSignatureHeader === 'string' ? workerSignatureHeader : null;
      const isInternal = workerReceiptId !== null && workerSignature !== null;
      if (isInternal) {
        const expected = createHmac('sha256', env.WEBHOOK_SECRET)
          .update(`vendepay-receipt:${workerReceiptId}`)
          .digest();
        const supplied = Buffer.from(workerSignature!, 'hex');
        if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
          return reply.code(404).send({ accepted: false });
        }
      } else if (!req.query.token) {
        return reply.code(404).send({ accepted: false });
      }

      let connection: VendepayConnection | undefined;
      let payload: unknown = req.body;
      let receiptId: string;
      if (isInternal) {
        const [receipt] = await app.db<
          Array<
            VendepayConnection & {
              receipt_id: string;
              payload: unknown;
              processing_payload_encrypted: string | null;
            }
          >
        >`
          SELECT vc.id,vc.project_id,vc.token_hash,tp.offer_id,vc.name,vc.payload_adapter,
                 vc.signing_secret_encrypted,wr.id AS receipt_id,wr.payload,wr.processing_payload_encrypted
          FROM webhook_receipts wr
          JOIN vendepay_connections vc ON vc.id=wr.connection_id
          JOIN tracking_projects tp ON tp.id=vc.project_id
          WHERE wr.id=${workerReceiptId} AND vc.enabled=true
          LIMIT 1
        `;
        if (!receipt) return reply.code(404).send({ accepted: false });
        connection = receipt;
        receiptId = receipt.receipt_id;
        if (receipt.processing_payload_encrypted) {
          if (!env.TRACKING_ENCRYPTION_KEY)
            throw new Error('missing encryption key for webhook receipt');
          payload = JSON.parse(
            decryptSecret(receipt.processing_payload_encrypted, env.TRACKING_ENCRYPTION_KEY),
          );
        } else {
          payload = receipt.payload;
        }
      } else {
        const candidate = tokenHash(req.query.token!);
        const connections = await app.db<
          Array<{
            id: string;
            project_id: string;
            token_hash: string;
            offer_id: string;
            name: string;
            payload_adapter: 'vendepay' | 'explodely';
            signing_secret_encrypted: string | null;
          }>
        >`
        SELECT vc.id,vc.project_id,vc.token_hash,tp.offer_id,vc.name,vc.payload_adapter,
               COALESCE(gateway_signing.signing_secret_encrypted,vc.signing_secret_encrypted)
                 AS signing_secret_encrypted
        FROM vendepay_connections vc
        JOIN tracking_projects tp ON tp.id = vc.project_id
        LEFT JOIN LATERAL (
          SELECT signing_secret_encrypted
          FROM tracking_gateway_connections
          WHERE provider='vendepay' AND project_id=vc.project_id AND enabled=true
          LIMIT 1
        ) gateway_signing ON true
        WHERE vc.token_hash = ${candidate} AND vc.enabled = true
        LIMIT 1
      `;
        connection = connections[0];
        receiptId = ulid();
      }
      if (!connection) return reply.code(404).send({ accepted: false });

      if (!isInternal) {
        const signature = verifyGatewayWebhook({
          provider: 'vendepay',
          request: req,
          encryptedSecret: connection.signing_secret_encrypted,
        });
        if (!signature.accepted) {
          return reply.code(401).send({ accepted: false, error: signature.error });
        }
      }

      const normalized = normalizeVendepayWebhook(
        payload,
        connection.payload_adapter === 'explodely',
      );
      if (!isInternal) {
        const receiptPayload = webhookPayloadForStorage(payload, env.WEBHOOK_PAYLOAD_SCRUB);
        const processingPayloadEncrypted = env.TRACKING_ENCRYPTION_KEY
          ? encryptSecret(JSON.stringify(payload), env.TRACKING_ENCRYPTION_KEY)
          : null;
        if (env.WEBHOOK_PAYLOAD_SCRUB && !processingPayloadEncrypted) {
          req.log.error(
            { receiptId },
            'cannot durably queue scrubbed Vendepay webhook without encryption',
          );
          return reply.code(503).send({ accepted: false });
        }
        const receipts = await app.db<{ id: string }[]>`
          INSERT INTO webhook_receipts
            (id,connection_id,dedupe_key,payload,processing_payload_encrypted,state,diagnostics)
          VALUES(${receiptId},${connection.id},${normalized.dedupeKey},${app.db.json(receiptPayload as never)},
            ${processingPayloadEncrypted},${normalized.kind === 'processable' ? 'received' : normalized.kind},
            ${app.db.json(normalized.kind === 'quarantined' ? normalized.diagnostics : [])})
          ON CONFLICT(connection_id,dedupe_key) DO NOTHING
          RETURNING id
        `;
        if (!receipts[0]) return reply.code(200).send({ accepted: true, duplicate: true });
        if (normalized.kind !== 'processable') {
          return reply.code(202).send({ accepted: true, state: normalized.kind });
        }
        // PostgreSQL retains the durable receipt. If Redis is unavailable, the
        // recovery sweep adds the job later without asking VendePay to retry.
        void app.vendepayWebhookQueue
          .add('process', { receiptId }, { jobId: receiptId })
          .catch((error) =>
            req.log.error({ error, receiptId }, 'failed to enqueue Vendepay webhook'),
          );
        return reply.code(202).send({ accepted: true, receipt_id: receiptId, state: 'received' });
      }
      if (normalized.kind !== 'processable') return reply.code(202).send({ accepted: true });
      // Offers live in Redis (OfferStore), not Postgres — resolve the funnel
      // name here (route has app.offerStore) so it can be persisted onto the
      // Pushcut outbox row for the worker (Postgres-only, no Redis access)
      // to read back. Only bother when the webhook could actually produce a
      // delivery.
      const funnelName =
        normalized.kind === 'processable'
          ? ((await app.offerStore.maybeGet(connection.offer_id))?.name ?? null)
          : null;
      // Convert to BRL before opening the DB transaction: the rate fetch can
      // hit the network, and we don't want to hold a Postgres tx open during
      // an outbound HTTP call. If the rate service is down and this currency
      // has never been cached, amount_brl_minor stays NULL and a later replay
      // can fill it in.
      let ingestBrlMinor: number | null = null;
      let ingestExchangeRate: number | null = null;
      if (
        normalized.kind === 'processable' &&
        normalized.event.amountMinor != null &&
        normalized.event.currency
      ) {
        const converted = await convertToBrlMinor(
          normalized.event.amountMinor,
          normalized.event.currency,
          app.db,
        );
        if (converted) {
          ingestBrlMinor = converted.brlMinor;
          ingestExchangeRate = converted.rate;
        }
      }
      const ingestConvertedAt = ingestBrlMinor != null ? new Date() : null;
      const outcome = await processVendepayReceipt(
        app,
        {
          normalized,
          req,
          connection,
          receiptId,
          ingestBrlMinor,
          ingestExchangeRate,
          ingestConvertedAt,
        },
        funnelName,
      );
      if (outcome.inserted) {
        await invalidateOfferAnalytics(app, connection.offer_id);
      }
      await Promise.allSettled(
        outcome.deliveryIds.map((deliveryId) => app.metaQueue.add('send', { deliveryId })),
      );
      await Promise.allSettled(
        outcome.utmifyDeliveryIds.map((deliveryId) =>
          app.utmifyDeliveryQueue.add('send', { deliveryId }),
        ),
      );
      await Promise.allSettled(
        outcome.pushcutDeliveryIds.map((deliveryId) =>
          app.pushcutQueue.add('send', { deliveryId }),
        ),
      );
      await Promise.allSettled(
        (outcome.tiktokDeliveryIds ?? []).map((deliveryId) =>
          app.tiktokQueue.add('send', { deliveryId }),
        ),
      );
      const rewardsOffer = resolveYoutubeRewardsOffer(funnelName);
      if (
        outcome.inserted &&
        rewardsOffer &&
        normalized.kind === 'processable' &&
        normalized.event.status === 'paid' &&
        normalized.event.buyer.email
      ) {
        provisionYoutubeRewardsAccount({
          offer: rewardsOffer,
          email: normalized.event.buyer.email,
          name: normalized.event.buyer.name,
          transactionId: normalized.event.transactionId,
        }).catch((error) =>
          req.log.error(
            { error, transactionId: normalized.event.transactionId },
            'youtube rewards account provisioning failed',
          ),
        );
      }
      return reply.code(200).send({
        accepted: true,
        receipt_id: receiptId,
        meta_deliveries: outcome.deliveryIds.length,
        utmify_deliveries: outcome.utmifyDeliveryIds.length,
        pushcut_deliveries: outcome.pushcutDeliveryIds.length,
        tiktok_deliveries: outcome.tiktokDeliveryIds?.length ?? 0,
        ...(!outcome.inserted ? { duplicate: true } : {}),
      });
    },
  );
}
