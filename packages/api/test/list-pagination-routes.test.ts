import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import mediaJobsRoutes from '../src/routes/media-jobs.js';
import shieldJobsRoutes from '../src/routes/shield-jobs.js';
import usersRoutes from '../src/routes/users.js';

describe('paginated list routes', () => {
  it('returns only per_page users', async () => {
    const users = Array.from({ length: 25 }, (_, index) => ({
      id: `user-${index}`,
      email: `user-${index}@example.com`,
      name: `User ${index}`,
      role: 'user' as const,
      passwordHash: 'hash',
      createdAt: new Date(2026, 0, index + 1).toISOString(),
    }));
    const app = Fastify();
    app.decorate('userStore', {
      listAll: vi.fn().mockResolvedValue(users),
      toPublic: ({ passwordHash: _passwordHash, ...user }: (typeof users)[number]) => user,
    } as never);
    app.decorate('activityStore', {} as never);
    app.decorate('offerStore', {} as never);
    app.decorate('invalidateAuthUser', vi.fn());
    app.addHook('preHandler', async (request) => {
      request.user = {
        sub: 'admin-1',
        email: 'admin@example.com',
        role: 'admin',
        iat: 0,
        exp: Number.MAX_SAFE_INTEGER,
      };
    });
    await app.register(usersRoutes, { prefix: '/v1' });

    try {
      const response = await app.inject({ method: 'GET', url: '/v1/users?per_page=10' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        users: expect.any(Array),
        pagination: { page: 1, per_page: 10 },
      });
      expect(response.json().users).toHaveLength(10);
    } finally {
      await app.close();
    }
  });

  it('presigns only media jobs from the requested page', async () => {
    const jobs = Array.from({ length: 25 }, (_, index) => ({
      id: `job-${index}`,
      userId: 'user-1',
      status: 'ready',
      outputStorageKey: `outputs/${index}.mp4`,
      outputFilename: `${index}.mp4`,
      createdAt: new Date(2026, 0, index + 1).toISOString(),
      updatedAt: new Date(2026, 0, index + 1).toISOString(),
    }));
    const presignGet = vi.fn().mockResolvedValue('https://example.com/download');
    const app = Fastify();
    app.decorate('mediaJobStore', { listByUser: vi.fn().mockResolvedValue(jobs) } as never);
    app.decorate('storage', { presignGet } as never);
    app.addHook('preHandler', async (request) => {
      request.user = {
        sub: 'user-1',
        email: 'user@example.com',
        role: 'user',
        iat: 0,
        exp: Number.MAX_SAFE_INTEGER,
      };
    });
    await app.register(mediaJobsRoutes, { prefix: '/v1' });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/media-jobs?page=2&per_page=10',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().jobs).toHaveLength(10);
      expect(presignGet).toHaveBeenCalledTimes(10);
      expect(presignGet).toHaveBeenCalledWith('outputs/10.mp4', 24 * 60 * 60, '10.mp4');
    } finally {
      await app.close();
    }
  });

  it('presigns only shield jobs from the requested page', async () => {
    const jobs = Array.from({ length: 25 }, (_, index) => ({
      id: `job-${index}`,
      userId: 'user-1',
      status: 'ready',
      outputStorageKey: `shield/${index}.mp4`,
      outputFilename: `${index}.mp4`,
      createdAt: new Date(2026, 0, index + 1).toISOString(),
      updatedAt: new Date(2026, 0, index + 1).toISOString(),
    }));
    const presignGet = vi.fn().mockResolvedValue('https://example.com/download');
    const app = Fastify();
    app.decorate('shieldJobStore', { listByUser: vi.fn().mockResolvedValue(jobs) } as never);
    app.decorate('storage', { presignGet } as never);
    app.addHook('preHandler', async (request) => {
      request.user = {
        sub: 'user-1',
        email: 'user@example.com',
        role: 'user',
        iat: 0,
        exp: Number.MAX_SAFE_INTEGER,
      };
    });
    await app.register(shieldJobsRoutes, { prefix: '/v1' });

    try {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/shield-jobs?page=2&per_page=10',
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().jobs).toHaveLength(10);
      expect(presignGet).toHaveBeenCalledTimes(10);
      expect(presignGet).toHaveBeenCalledWith('shield/10.mp4', 24 * 60 * 60, '10.mp4');
    } finally {
      await app.close();
    }
  });
});
