import { Queue } from 'bullmq';
import { makeRedis } from '../lib/redis.js';
import { UTMIFY_DELIVERY_QUEUE_NAME, type UtmifyDeliveryJobData } from './index.js';

export function createUtmifyDeliveryQueue(redisUrl: string): Queue<UtmifyDeliveryJobData> {
  return new Queue<UtmifyDeliveryJobData>(UTMIFY_DELIVERY_QUEUE_NAME, {
    connection: makeRedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false }),
    defaultJobOptions: {
      attempts: 8,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 2_000 },
    },
  });
}
