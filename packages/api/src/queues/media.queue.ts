import { Queue } from 'bullmq';
import { makeRedis } from '../lib/redis.js';
import { MEDIA_QUEUE_NAME, type MediaJobData } from './index.js';

export function createMediaQueue(redisUrl: string): Queue<MediaJobData> {
  return new Queue<MediaJobData>(MEDIA_QUEUE_NAME, {
    connection: makeRedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false }),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'exponential', delay: 3_000 },
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });
}
