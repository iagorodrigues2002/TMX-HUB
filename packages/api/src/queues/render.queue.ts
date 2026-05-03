import { Queue } from 'bullmq';
import { makeRedis } from '../lib/redis.js';
import { RENDER_QUEUE_NAME, type RenderJobData } from './index.js';

export function createRenderQueue(redisUrl: string): Queue<RenderJobData> {
  const connection = makeRedis(redisUrl, { maxRetriesPerRequest: null, enableReadyCheck: false });
  return new Queue<RenderJobData>(RENDER_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });
}
