import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import type { Sql } from 'postgres';
import { ulid } from 'ulid';
import { env } from '../env.js';
import {
  type ExplodelyPayload,
  identifyExplodelyTransaction,
  parseExplodelyPayload,
} from '../integrations/explodely/normalize.js';
import { scrubWebhookPayload, scrubWebhookRawPayload } from '../lib/webhook-payload.js';
import { WEBHOOK_RATE_LIMIT } from '../plugins/rate-limit.js';

type ReceiptInput = {
  receiptId: string;
  transactionId: string;
  payload: ExplodelyPayload;
  rawBody: string;
  contentType: string;
};

export type ExplodelyRouteOptions = {
  persistReceipt?: (input: ReceiptInput) => Promise<{
    duplicate: boolean;
    receiptId?: string;
    shouldEnqueue?: boolean;
  }>;
  enqueue?: (receiptId: string) => Promise<unknown>;
  requireSignature?: boolean;
  webhookSecret?: string;
  webhookSecretPrevious?: string;
};

export async function persistExplodelyReceipt(db: Sql, input: ReceiptInput) {
  return db.begin(async (sql) => {
    const [receipt] = await sql<Array<{ id: string }>>`
      INSERT INTO tracking_gateway_webhook_receipts
        (id,gateway_connection_id,gateway,transaction_id,dedupe_key,payload,raw_payload,
         content_type,state)
      VALUES(${input.receiptId},NULL,'explodely',${input.transactionId},
        ${`explodely:${input.transactionId}`},${sql.json(input.payload as never)},
        ${input.rawBody},${input.contentType},'received')
      ON CONFLICT(gateway,transaction_id) DO NOTHING
      RETURNING id
    `;
    if (!receipt) {
      const [existing] = await sql<Array<{ id: string; state: string }>>`
        SELECT id,state FROM tracking_gateway_webhook_receipts
        WHERE gateway='explodely' AND transaction_id=${input.transactionId}
        LIMIT 1
      `;
      return {
        duplicate: true,
        receiptId: existing?.id,
        shouldEnqueue: existing?.state === 'received',
      };
    }
    await sql`
      INSERT INTO webhook_receipts
        (id,connection_id,gateway_connection_id,gateway,transaction_id,dedupe_key,payload,
         raw_payload,content_type,state)
      VALUES(${receipt.id},NULL,NULL,'explodely',${input.transactionId},
        ${`explodely:${input.transactionId}`},${sql.json(input.payload as never)},
        ${input.rawBody},${input.contentType},'received')
      ON CONFLICT(gateway,transaction_id) DO NOTHING
    `;
    return { duplicate: false, receiptId: receipt.id, shouldEnqueue: true };
  });
}

function signatureIsValid(rawBody: Buffer, supplied: string | undefined, secret: string) {
  if (!supplied) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const candidate = supplied
    .trim()
    .replace(/^sha256=/i, '')
    .toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(candidate)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(candidate, 'hex'));
}

const plugin: FastifyPluginAsync<ExplodelyRouteOptions> = async (app, options) => {
  const rawParser = (
    _request: unknown,
    body: Buffer,
    done: (error: Error | null, value?: Buffer) => void,
  ) => done(null, body);
  app.addContentTypeParser('application/json', { parseAs: 'buffer' }, rawParser);
  app.addContentTypeParser('application/x-www-form-urlencoded', { parseAs: 'buffer' }, rawParser);

  app.post(
    '/webhooks/explodely',
    {
      bodyLimit: 256 * 1024,
      logLevel: 'silent',
      config: { rateLimit: WEBHOOK_RATE_LIMIT },
    },
    async (request, reply) => {
      const rawBody = Buffer.isBuffer(request.body)
        ? request.body
        : Buffer.from(typeof request.body === 'string' ? request.body : '');
      const requireSignature = options.requireSignature ?? env.EXPLODELY_REQUIRE_SIGNATURE;
      const webhookSecret = options.webhookSecret ?? env.EXPLODELY_WEBHOOK_SECRET;
      const webhookSecretPrevious = options.webhookSecretPrevious ?? env.WEBHOOK_SECRET_PREV;
      const suppliedSignature =
        (request.headers['x-explodely-signature'] as string | undefined) ??
        (request.headers['x-signature'] as string | undefined);

      // TODO(SEC-C-004): substituir este modo tolerante pelo contrato oficial de
      // assinatura/replay protection quando o Explodely publicar ou confirmar o wire format.
      if (requireSignature && webhookSecret) {
        if (!signatureIsValid(rawBody, suppliedSignature, webhookSecret)) {
          if (
            !webhookSecretPrevious ||
            !signatureIsValid(rawBody, suppliedSignature, webhookSecretPrevious)
          ) {
            return reply.code(401).send({ accepted: false, error: 'invalid_signature' });
          }
          app.log.warn('Explodely signature accepted with previous webhook secret');
        }
      } else if (requireSignature) {
        request.log.error('Explodely signature is required but EXPLODELY_WEBHOOK_SECRET is unset');
        return reply.code(503).send({ accepted: false, error: 'signature_not_configured' });
      } else {
        request.log.warn(
          { signature_present: Boolean(suppliedSignature) },
          'Explodely webhook accepted with signature enforcement disabled (SEC-C-004)',
        );
      }

      const contentType = String(request.headers['content-type'] ?? '')
        .split(';')[0]!
        .trim();
      let payload: ExplodelyPayload;
      try {
        payload = parseExplodelyPayload(rawBody, contentType);
      } catch {
        return reply.code(400).send({ accepted: false, error: 'invalid_payload' });
      }
      const receiptId = ulid();
      const transactionId = identifyExplodelyTransaction(payload, rawBody);
      const persist =
        options.persistReceipt ??
        (app.db ? (input: ReceiptInput) => persistExplodelyReceipt(app.db!, input) : null);
      if (!persist)
        return reply.code(503).send({ accepted: false, error: 'tracking_database_unavailable' });
      const outcome = await persist({
        receiptId,
        transactionId,
        payload,
        rawBody: rawBody.toString('utf8'),
        contentType,
      });
      const enqueue =
        options.enqueue ?? ((id: string) => app.explodelyQueue.add('process', { receiptId: id }));
      if (outcome.shouldEnqueue ?? !outcome.duplicate) {
        await enqueue(outcome.receiptId ?? receiptId);
      }
      return reply.code(200).send({ accepted: true, duplicate: outcome.duplicate });
    },
  );
};

export default plugin;
