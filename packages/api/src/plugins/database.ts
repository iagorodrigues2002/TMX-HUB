import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import postgres, { type Sql } from 'postgres';
import { env } from '../env.js';

declare module 'fastify' {
  interface FastifyInstance {
    db: Sql | null;
  }
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const db = env.DATABASE_URL
    ? postgres(env.DATABASE_URL, {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
        ssl: env.NODE_ENV === 'production' ? 'require' : false,
      })
    : null;

  app.decorate('db', db);
  app.addHook('onClose', async () => {
    await db?.end({ timeout: 5 });
  });
};

// The routes are registered as sibling plugins. Bypass Fastify encapsulation so
// every route receives the same managed PostgreSQL connection.
(plugin as unknown as Record<symbol, boolean>)[Symbol.for('skip-override')] = true;

export default plugin;
