import { Queue } from 'bullmq';
import { makeRedis } from '../lib/redis.js';
import { PUSHCUT_QUEUE_NAME, type PushcutJobData } from './index.js';

export function createPushcutQueue(redisUrl: string): Queue<PushcutJobData> {
  return new Queue<PushcutJobData>(PUSHCUT_QUEUE_NAME, {
    connection: makeRedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false }),
    defaultJobOptions: {
      attempts: 8,
      backoff: { type: 'exponential', delay: 5_000 },
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 2_000 },
    },
  });
}
