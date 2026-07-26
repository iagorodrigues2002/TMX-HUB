import { Queue } from 'bullmq';
import { makeRedis } from '../lib/redis.js';
import { META_QUEUE_NAME, type MetaJobData } from './index.js';

export function createMetaQueue(redisUrl: string): Queue<MetaJobData> {
  return new Queue<MetaJobData>(META_QUEUE_NAME, {
    connection: makeRedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false }),
    defaultJobOptions: {
      attempts: 5,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 1_000 },
    },
  });
}
