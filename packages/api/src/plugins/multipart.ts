import multipart from '@fastify/multipart';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

/**
 * Multipart parser for file uploads (Shield video + niche white audios).
 * 100MB cap matches Maskai's Starter plan; tweak per route via `attachFieldsToBody`
 * if you need stricter bounds elsewhere.
 */
const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB
      files: 1,
      fields: 20,
      fieldSize: 1 * 1024 * 1024,
    },
  });
};

(plugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

export default plugin;
