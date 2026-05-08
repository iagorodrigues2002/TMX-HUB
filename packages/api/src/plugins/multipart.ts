import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

/**
 * Multipart parser for file uploads (Shield video + niche white audios).
 * 500MB cap — multipart body limit. Per-route limits podem ser mais
 * estritos (audio white tem cap menor no próprio handler).
 */
const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  await app.register(multipart, {
    limits: {
      fileSize: 500 * 1024 * 1024, // 500MB
      files: 1,
      fields: 20,
      fieldSize: 1 * 1024 * 1024,
    },
  });
};

(plugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

export default plugin;
