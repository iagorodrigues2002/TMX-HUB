import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import errorHandlerPlugin from '../src/plugins/error-handler.js';
import clonesRoutes from '../src/routes/clones.js';

describe('BOLA ownership isolation', () => {
  it('blocks user B from reading a clone created by user A', async () => {
    const hashes = new Map<string, Map<string, string>>();
    const redis = {
      async hset(key: string, field: string, value: string) {
        const hash = hashes.get(key) ?? new Map<string, string>();
        hash.set(field, value);
        hashes.set(key, hash);
        return 1;
      },
      async hget(key: string, field: string) {
        return hashes.get(key)?.get(field) ?? null;
      },
      async del(key: string) {
        return hashes.delete(key) ? 1 : 0;
      },
    };
    const cloneMeta = new Map<string, Record<string, unknown>>();
    const jobStore = {
      createClone: vi.fn(async ({ id, sourceUrl, options }) => {
        const now = new Date().toISOString();
        const meta = {
          id,
          status: 'queued',
          sourceUrl,
          options,
          createdAt: now,
          updatedAt: now,
          progress: 0,
          forms: 0,
          links: 0,
          assets: 0,
          bytes: 0,
          etag: `\"${id}\"`,
        };
        cloneMeta.set(id, meta);
        return meta;
      }),
      getCloneMeta: vi.fn(async (id: string) => cloneMeta.get(id)),
      maybeGetCloneMeta: vi.fn(async (id: string) => cloneMeta.get(id) ?? null),
      checkIdempotency: vi.fn(async () => ({ hit: false })),
      storeIdempotency: vi.fn(),
      deleteClone: vi.fn(),
    };
    let currentUser = 'user-a';
    const app = Fastify();
    app.decorate('redis', redis);
    app.decorate('jobStore', jobStore);
    app.decorate('renderQueue', { add: vi.fn() });
    app.decorate('activityStore', { record: vi.fn() });
    app.addHook('preHandler', async (request) => {
      request.user = {
        sub: currentUser,
        email: `${currentUser}@example.com`,
        role: 'user',
        iat: 0,
        exp: Number.MAX_SAFE_INTEGER,
      };
    });

    try {
      await app.register(errorHandlerPlugin);
      await app.register(clonesRoutes);

      const created = await app.inject({
        method: 'POST',
        url: '/clones',
        payload: { url: 'https://example.com' },
      });
      expect(created.statusCode).toBe(202);
      const { id } = created.json<{ id: string }>();

      const ownerRead = await app.inject({ method: 'GET', url: `/clones/${id}` });
      expect(ownerRead.statusCode).toBe(200);
      const readsBeforeCrossTenantAttempt = jobStore.getCloneMeta.mock.calls.length;

      currentUser = 'user-b';
      const crossTenantRead = await app.inject({ method: 'GET', url: `/clones/${id}` });

      expect(crossTenantRead.statusCode).toBe(403);
      expect(jobStore.getCloneMeta).toHaveBeenCalledTimes(readsBeforeCrossTenantAttempt);
    } finally {
      await app.close();
    }
  });
});
