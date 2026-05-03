import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { BUNDLE_QUEUE_NAME, type BundleJobData } from './index.js';

export function createBundleQueue(connection: Redis): Queue<BundleJobData> {
  return new Queue<BundleJobData>(BUNDLE_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });
}
