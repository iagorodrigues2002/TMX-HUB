import { Queue } from 'bullmq';
import { makeRedis } from '../lib/redis.js';
import { VSL_QUEUE_NAME, type VslJobData } from './index.js';

export function createVslQueue(redisUrl: string): Queue<VslJobData> {
  const connection = makeRedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
  return new Queue<VslJobData>(VSL_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });
}
