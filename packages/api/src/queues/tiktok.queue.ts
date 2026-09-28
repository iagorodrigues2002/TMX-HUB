import { Queue } from 'bullmq';
import { makeRedis } from '../lib/redis.js';
import { TIKTOK_QUEUE_NAME, type TikTokJobData } from './index.js';

export function createTikTokQueue(redisUrl: string): Queue<TikTokJobData> {
  return new Queue<TikTokJobData>(TIKTOK_QUEUE_NAME, {
    connection: makeRedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false }),
    defaultJobOptions: { attempts: 6, backoff: { type: 'exponential', delay: 5_000 }, removeOnComplete: { count: 1_000 }, removeOnFail: { count: 2_000 } },
  });
}
