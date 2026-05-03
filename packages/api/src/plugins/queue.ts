import type { Queue } from 'bullmq';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { Redis } from 'ioredis';
import { env } from '../env.js';
import { createBundleQueue } from '../queues/bundle.queue.js';
import type { BundleJobData, RenderJobData } from '../queues/index.js';
import { createRenderQueue } from '../queues/render.queue.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    renderQueue: Queue<RenderJobData>;
    bundleQueue: Queue<BundleJobData>;
  }
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // BullMQ requires `maxRetriesPerRequest: null` on the connection.
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });
  redis.on('error', (err) => {
    app.log.error({ err }, 'redis error');
  });

  const renderQueue = createRenderQueue(redis);
  const bundleQueue = createBundleQueue(redis);

  app.decorate('redis', redis);
  app.decorate('renderQueue', renderQueue);
  app.decorate('bundleQueue', bundleQueue);

  app.addHook('onClose', async () => {
    await renderQueue.close();
    await bundleQueue.close();
    await redis.quit();
  });
};

(plugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

export default plugin;
