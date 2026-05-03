import { Queue } from 'bullmq';
import type { Redis } from 'ioredis';
import { RENDER_QUEUE_NAME, type RenderJobData } from './index.js';

export function createRenderQueue(connection: Redis): Queue<RenderJobData> {
  return new Queue<RenderJobData>(RENDER_QUEUE_NAME, {
    connection,
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 100 },
    },
  });
}
