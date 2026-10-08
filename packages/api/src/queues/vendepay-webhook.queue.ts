import { Queue } from 'bullmq';
import { makeRedis } from '../lib/redis.js';
import { VENDEPAY_WEBHOOK_QUEUE_NAME, type VendepayWebhookJobData } from './index.js';

/**
 * Durable work triggered after VendePay has already received its 202 response.
 * Keeping this separate prevents a slow database, FX lookup or attribution query
 * from occupying the payment gateway's delivery connection.
 */
export function createVendepayWebhookQueue(redisUrl: string): Queue<VendepayWebhookJobData> {
  return new Queue<VendepayWebhookJobData>(VENDEPAY_WEBHOOK_QUEUE_NAME, {
    connection: makeRedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false }),
    defaultJobOptions: {
      attempts: 8,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { count: 5_000 },
      removeOnFail: { count: 5_000 },
    },
  });
}
