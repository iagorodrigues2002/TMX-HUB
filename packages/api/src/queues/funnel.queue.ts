import { Queue } from 'bullmq';
import { makeRedis } from '../lib/redis.js';
import { FUNNEL_QUEUE_NAME, type FunnelJobData } from './index.js';

export function createFunnelQueue(redisUrl: string): Queue<FunnelJobData> {
  const connection = makeRedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
  return new Queue<FunnelJobData>(FUNNEL_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 50 },
    },
  });
}
