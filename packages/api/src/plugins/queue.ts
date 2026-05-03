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
  // Job-store Redis: fail fast (maxRetriesPerRequest: 3) so HTTP handlers return
  // a proper 500 instead of hanging when Redis is unavailable. Hanging requests
  // cause Railway's LB to return a 502 without CORS headers, which the browser
  // misreports as "Network error: Failed to fetch".
  const redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    connectTimeout: 5_000,
    enableReadyCheck: false,
  });
  redis.on('error', (err) => {
    app.log.error({ err }, 'redis error');
  });

  // BullMQ queues and workers each need their own dedicated Redis connections
  // with maxRetriesPerRequest: null (BullMQ requirement for blocking commands).
  // Pass the URL so each queue creates an independent connection.
  const renderQueue = createRenderQueue(env.REDIS_URL);
  const bundleQueue = createBundleQueue(env.REDIS_URL);

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
