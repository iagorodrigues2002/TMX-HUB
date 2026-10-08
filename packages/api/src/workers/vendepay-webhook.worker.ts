import { createHmac } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { Worker } from 'bullmq';
import { env } from '../env.js';
import { makeRedis } from '../lib/redis.js';
import { VENDEPAY_WEBHOOK_QUEUE_NAME, type VendepayWebhookJobData } from '../queues/index.js';

const signatureFor = (receiptId: string) =>
  createHmac('sha256', env.WEBHOOK_SECRET).update(`vendepay-receipt:${receiptId}`).digest('hex');

/**
 * Executes the existing VendePay normalization pipeline through the internal
 * route only after the external caller has received a durable 202 response.
 */
export function createVendepayWebhookWorker(
  app: FastifyInstance<any, any, any, any, any>,
): Worker<VendepayWebhookJobData> {
  return new Worker<VendepayWebhookJobData>(
    VENDEPAY_WEBHOOK_QUEUE_NAME,
    async (job) => {
      try {
        const result = await app.inject({
          method: 'POST',
          url: '/v1/webhooks/vendepay',
          headers: {
            'x-tmx-vendepay-receipt': job.data.receiptId,
            'x-tmx-vendepay-signature': signatureFor(job.data.receiptId),
          },
        });
        if (result.statusCode >= 500) {
          throw new Error(`VendePay receipt ${job.data.receiptId} worker HTTP ${result.statusCode}`);
        }
        if (result.statusCode >= 400) {
          throw new Error(
            `VendePay receipt ${job.data.receiptId} worker HTTP ${result.statusCode}: ${result.body.slice(0, 500)}`,
          );
        }
      } catch (error) {
        if (job.attemptsMade + 1 >= 8 && app.db) {
          const message = error instanceof Error ? error.message : String(error);
          await app.db`
            UPDATE webhook_receipts
            SET state='failed', diagnostics=${app.db.json([message])}
            WHERE id=${job.data.receiptId} AND processed_at IS NULL
          `;
        }
        throw error;
      }
    },
    {
      connection: makeRedis(env.REDIS_URL, { maxRetriesPerRequest: null, enableReadyCheck: false }),
      concurrency: 8,
    },
  );
}
