import { Queue } from 'bullmq';
import { makeRedis } from '../lib/redis.js';
import { SHIELD_QUEUE_NAME, type ShieldJobData } from './index.js';

export function createShieldQueue(redisUrl: string): Queue<ShieldJobData> {
  const connection = makeRedis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
  return new Queue<ShieldJobData>(SHIELD_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });
}
