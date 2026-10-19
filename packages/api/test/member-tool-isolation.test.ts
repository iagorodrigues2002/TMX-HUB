import Fastify, { type FastifyRequest } from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { HttpProblem } from '../src/lib/problem.js';
import mediaRoutes from '../src/routes/media-jobs.js';
import metaControlRoutes from '../src/routes/meta-control.js';
import nicheRoutes from '../src/routes/niches.js';
import previewRoutes from '../src/routes/preview.js';
import shieldRoutes from '../src/routes/shield-jobs.js';
import utmifyGlobalRoutes from '../src/routes/utmify-global-admin.js';
import { NicheStore } from '../src/services/niche-store.js';

vi.mock('../src/env.js', () => ({ env: {} }));

describe('member tool isolation', () => {
  const nicheA = {
    id: 'niche-a',
    userId: 'a',
    name: 'Private A',
    whites: [],
    createdAt: '2026-01-01',
  };
  const nicheB = { ...nicheA, id: 'niche-b', userId: 'b', name: 'Private B' };

  it('global integration configuration is admin-only before database access', async () => {
    const app = Fastify();
    app.decorate('db', null);
    app.addHook('preHandler', async (req) => {
      const user = req.headers['x-test-user'];
      if (!user) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
      req.user = { sub: String(user), role: user === 'admin' ? 'admin' : 'user' } as never;
    });
    await app.register(metaControlRoutes);
    await app.register(utmifyGlobalRoutes);
    for (const url of ['/meta-control/connections', '/utmify-global']) {
      expect((await app.inject(url)).statusCode).toBe(401);
      for (const user of ['a', 'b']) {
        expect((await app.inject({ url, headers: { 'x-test-user': user } })).statusCode).toBe(403);
      }
      expect((await app.inject({ url, headers: { 'x-test-user': 'admin' } })).statusCode).toBe(503);
    }
    await app.close();
  });

  it('filters niche inventory and rejects another owner before white selection', async () => {
    const store = new NicheStore({} as never);
    vi.spyOn(store, 'listAll').mockResolvedValue([nicheA, nicheB]);
    vi.spyOn(store, 'get').mockImplementation(async (id) => (id === 'niche-a' ? nicheA : nicheB));
    expect(await store.listForUser('a')).toEqual([nicheA]);
    expect(await store.listForUser('b')).toEqual([nicheB]);
    expect(await store.listForUser('admin', true)).toEqual([nicheA, nicheB]);
    await expect(store.assertAccess('niche-b', 'a')).rejects.toMatchObject({ status: 404 });
    expect(await store.assertAccess('niche-b', 'admin', true)).toEqual(nicheB);
  });

  it('media and shield reject another member niche before audio selection or storage', async () => {
    const app = Fastify();
    app.setErrorHandler((error, _req, reply) =>
      reply
        .code(error instanceof HttpProblem ? error.status : (error.statusCode ?? 500))
        .send({ error: error.message }),
    );
    const store = new NicheStore({} as never);
    vi.spyOn(store, 'get').mockResolvedValue({
      ...nicheB,
      whites: [
        {
          id: 'white-b',
          filename: 'private-b.mp3',
          storageKey: 'private/b',
          bytes: 3,
          createdAt: '2026-01-01',
        },
      ],
    });
    const pick = vi.spyOn(store, 'pickRandomWhite');
    const upload = vi.fn(async () => {
      throw Object.assign(new Error('test upload boundary'), { statusCode: 503 });
    });
    app.decorate('nicheStore', store);
    app.decorate('storage', { putStream: upload });
    app.decorate('mediaJobStore', { inputKey: () => 'test/media' });
    app.decorate('shieldJobStore', { inputKey: () => 'test/shield' });
    app.addHook('preHandler', async (req) => {
      const user = req.headers['x-test-user'];
      if (!user) throw Object.assign(new Error('Unauthorized'), { statusCode: 401 });
      req.user = { sub: String(user), role: user === 'admin' ? 'admin' : 'user' } as never;
      Object.assign(req, {
        isMultipart: () => true,
        parts: async function* () {
          yield { type: 'field', fieldname: 'phase_cancel', value: 'true' };
          yield { type: 'field', fieldname: 'niche_id', value: 'niche-b' };
          yield {
            type: 'file',
            fieldname: 'file',
            filename: 'test.mp4',
            mimetype: 'video/mp4',
            file: {},
          };
        },
      });
    });
    await app.register(mediaRoutes);
    await app.register(shieldRoutes);
    for (const url of ['/media-jobs', '/shield-jobs']) {
      expect((await app.inject({ method: 'POST', url })).statusCode).toBe(401);
      expect(
        (await app.inject({ method: 'POST', url, headers: { 'x-test-user': 'a' } })).statusCode,
      ).toBe(404);
      expect(pick).not.toHaveBeenCalled();
      expect(upload).not.toHaveBeenCalled();
    }
    for (const url of ['/media-jobs', '/shield-jobs']) {
      for (const user of ['b', 'admin']) {
        expect(
          (await app.inject({ method: 'POST', url, headers: { 'x-test-user': user } })).statusCode,
        ).toBe(503);
      }
    }
    expect(upload).toHaveBeenCalledTimes(4);
    await app.close();
  });

  it('niche list API exposes own items only, admin sees both, unauthenticated is rejected', async () => {
    const store = new NicheStore({} as never);
    vi.spyOn(store, 'listAll').mockResolvedValue([nicheA, nicheB]);
    const app = Fastify();
    app.decorate('nicheStore', store);
    app.addHook('preHandler', async (req) => {
      const user = req.headers['x-test-user'];
      if (!user) throw new HttpProblem({ status: 401, title: 'Unauthorized' });
      req.user = { sub: String(user), role: user === 'admin' ? 'admin' : 'user' } as never;
    });
    await app.register(nicheRoutes);
    for (const user of ['a', 'b', 'admin']) {
      const res = await app.inject({
        method: 'GET',
        url: '/niches',
        headers: { 'x-test-user': user },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().niches.map((n: { id: string }) => n.id)).toEqual(
        user === 'admin' ? ['niche-a', 'niche-b'] : [`niche-${user}`],
      );
    }
    expect((await app.inject('/niches')).statusCode).toBe(401);
    await app.close();
  });

  it('preview rejects anonymous and cross-member requests, including matching ETag', async () => {
    const app = Fastify();
    app.setErrorHandler((error, _req, reply) =>
      reply.code(error instanceof HttpProblem ? error.status : 500).send({ error: error.message }),
    );
    app.decorate('requireAuth', async (req: FastifyRequest) => {
      const user = req.headers['x-test-user'];
      if (typeof user !== 'string' || !user)
        throw new HttpProblem({ status: 401, title: 'Unauthorized' });
      req.user = {
        sub: user,
        role: user === 'admin' ? 'admin' : 'user',
        email: 'fixture@example.test',
        iat: 0,
        exp: 0,
      };
    });
    app.decorate('redis', { hget: vi.fn(async () => 'a') });
    const meta = vi.fn(async () => ({ status: 'ready', etag: 'private-etag' }));
    const state = vi.fn(async () => ({ html: '<p>private</p>' }));
    app.decorate('jobStore', { getCloneMeta: meta, getCloneState: state });
    await app.register(previewRoutes);
    const url = '/clones/01KZ2PXS13H88Z3NDRSV6N4PR3/preview';
    expect((await app.inject(url)).statusCode).toBe(401);
    expect(
      (await app.inject({ url, headers: { 'x-test-user': 'b', 'if-none-match': 'private-etag' } }))
        .statusCode,
    ).toBe(403);
    expect(meta).not.toHaveBeenCalled();
    expect(state).not.toHaveBeenCalled();
    for (const user of ['a', 'admin']) {
      const res = await app.inject({ url, headers: { 'x-test-user': user } });
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.body).toBe('<p>private</p>');
    }
    await app.close();
  });
});
