import { Queue } from 'bullmq';
import { makeRedis } from '../lib/redis.js';
import { UTMIFY_WEB_EVENT_QUEUE_NAME, type UtmifyWebEventJobData } from './index.js';

export function createUtmifyWebEventQueue(redisUrl: string): Queue<UtmifyWebEventJobData> {
  return new Queue<UtmifyWebEventJobData>(UTMIFY_WEB_EVENT_QUEUE_NAME, {
    connection: makeRedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false }),
    defaultJobOptions: {
      attempts: 8,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 2_000 },
      removeOnFail: { count: 2_000 },
    },
  });
}
