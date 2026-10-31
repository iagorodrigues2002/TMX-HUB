import { buildApp } from '../src/app.js';
import { env } from '../src/env.js';

// Preview HTTP only: server.ts also starts workers and business automations.
const database = new URL(env.DATABASE_URL ?? 'http://invalid');
const redis = new URL(env.REDIS_URL);
if (env.NODE_ENV === 'production' || database.hostname !== '127.0.0.1' ||
  !database.pathname.startsWith('/tmx_live_preview_') || redis.hostname !== '127.0.0.1' ||
  !redis.port || redis.port === '6379') {
  throw new Error('Local preview requires an isolated local database and Redis.');
}
const app = await buildApp();
await app.listen({ port: env.API_PORT, host: '127.0.0.1' });
for (const signal of ['SIGTERM', 'SIGINT'] as const) {
  process.once(signal, () => { void app.close().then(() => process.exit(0)); });
}
