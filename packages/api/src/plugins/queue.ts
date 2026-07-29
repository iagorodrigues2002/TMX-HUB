import type { Queue } from 'bullmq';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { Redis } from 'ioredis';
import { env } from '../env.js';
import { makeRedis } from '../lib/redis.js';
import { createBundleQueue } from '../queues/bundle.queue.js';
import { createFunnelQueue } from '../queues/funnel.queue.js';
import type {
  BundleJobData,
  FunnelJobData,
  MediaJobData,
  MetaJobData,
  RenderJobData,
  ShieldJobData,
  UtmifyDeliveryJobData,
  UtmifyWebEventJobData,
  VslJobData,
} from '../queues/index.js';
import { createMediaQueue } from '../queues/media.queue.js';
import { createMetaQueue } from '../queues/meta.queue.js';
import { createRenderQueue } from '../queues/render.queue.js';
import { createShieldQueue } from '../queues/shield.queue.js';
import { createUtmifyDeliveryQueue } from '../queues/utmify-delivery.queue.js';
import { createUtmifyWebEventQueue } from '../queues/utmify-web-event.queue.js';
import { createVslQueue } from '../queues/vsl.queue.js';

declare module 'fastify' {
  interface FastifyInstance {
    redis: Redis;
    renderQueue: Queue<RenderJobData>;
    bundleQueue: Queue<BundleJobData>;
    vslQueue: Queue<VslJobData>;
    funnelQueue: Queue<FunnelJobData>;
    shieldQueue: Queue<ShieldJobData>;
    mediaQueue: Queue<MediaJobData>;
    metaQueue: Queue<MetaJobData>;
    utmifyDeliveryQueue: Queue<UtmifyDeliveryJobData>;
    utmifyWebEventQueue: Queue<UtmifyWebEventJobData>;
  }
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  // Job-store Redis: fail fast (maxRetriesPerRequest: 3) so HTTP handlers return
  // a proper 500 instead of hanging when Redis is unavailable. Hanging requests
  // cause Railway's LB to return a 502 without CORS headers, which the browser
  // misreports as "Network error: Failed to fetch".
  const redis = makeRedis(env.REDIS_URL, {
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
  const vslQueue = createVslQueue(env.REDIS_URL);
  const funnelQueue = createFunnelQueue(env.REDIS_URL);
  const shieldQueue = createShieldQueue(env.REDIS_URL);
  const mediaQueue = createMediaQueue(env.REDIS_URL);
  const metaQueue = createMetaQueue(env.REDIS_URL);
  const utmifyDeliveryQueue = createUtmifyDeliveryQueue(env.REDIS_URL);
  const utmifyWebEventQueue = createUtmifyWebEventQueue(env.REDIS_URL);

  app.decorate('redis', redis);
  app.decorate('renderQueue', renderQueue);
  app.decorate('bundleQueue', bundleQueue);
  app.decorate('vslQueue', vslQueue);
  app.decorate('funnelQueue', funnelQueue);
  app.decorate('shieldQueue', shieldQueue);
  app.decorate('mediaQueue', mediaQueue);
  app.decorate('metaQueue', metaQueue);
  app.decorate('utmifyDeliveryQueue', utmifyDeliveryQueue);
  app.decorate('utmifyWebEventQueue', utmifyWebEventQueue);

  app.addHook('onClose', async () => {
    await renderQueue.close();
    await bundleQueue.close();
    await vslQueue.close();
    await funnelQueue.close();
    await shieldQueue.close();
    await mediaQueue.close();
    await metaQueue.close();
    await utmifyDeliveryQueue.close();
    await utmifyWebEventQueue.close();
    await redis.quit();
  });
};

(plugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

export default plugin;
