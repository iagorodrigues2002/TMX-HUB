import { Queue } from 'bullmq';
import { makeRedis } from '../lib/redis.js';
import { EXPLODELY_QUEUE_NAME, type ExplodelyJobData } from './index.js';

export function createExplodelyQueue(redisUrl: string): Queue<ExplodelyJobData> {
  return new Queue<ExplodelyJobData>(EXPLODELY_QUEUE_NAME, {
    connection: makeRedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false }),
    defaultJobOptions: {
      attempts: 8,
      backoff: { type: 'exponential', delay: 2_000 },
      removeOnComplete: { count: 1_000 },
      removeOnFail: { count: 2_000 },
    },
  });
}
