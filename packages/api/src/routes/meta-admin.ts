import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { registerGetMetaPixelsRoutes } from './meta-admin/get-meta-pixels.js';
import { registerPostMetaEventsReplayRoutes } from './meta-admin/post-meta-events-replay.js';
import { registerPostMetaPixelsPixelIdTestEventRoutes } from './meta-admin/post-meta-pixels-pixel-id-test-event.js';

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  registerGetMetaPixelsRoutes(app);
  registerPostMetaPixelsPixelIdTestEventRoutes(app);
  registerPostMetaEventsReplayRoutes(app);
};

export default plugin;
