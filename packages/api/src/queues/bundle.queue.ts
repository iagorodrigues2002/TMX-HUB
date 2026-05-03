import { Queue } from 'bullmq';
import { makeRedis } from '../lib/redis.js';
import { BUNDLE_QUEUE_NAME, type BundleJobData } from './index.js';

export function createBundleQueue(redisUrl: string): Queue<BundleJobData> {
  const connection = makeRedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
  return new Queue<BundleJobData>(BUNDLE_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });
}
