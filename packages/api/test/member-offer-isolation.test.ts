import Fastify from 'fastify';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { OfferStore } from '../src/services/offer-store.js';
import offersRoutes from '../src/routes/offers.js';
import usersRoutes from '../src/routes/users.js';

const offers = [
  { id: 'offer-a', userId: 'member-a', memberIds: ['member-b'], name: 'Private A', status: 'testando', createdAt: '2026-10-15' },
  { id: 'offer-b', userId: 'member-b', memberIds: ['member-a'], name: 'Private B', status: 'testando', createdAt: '2026-10-15' },
] as const;

describe('strict member offer isolation with legacy sharing records', () => {
  it.each([
    ['GET', '/users', undefined],
    ['GET', '/admin/overview', undefined],
    ['PATCH', '/users/member-b', { role: 'admin', allowed_tools: [] }],
    ['DELETE', '/users/member-b', undefined],
  ] as const)('denies member access to administrative %s %s before store access', async (method, url, payload) => {
    const app = Fastify();
    const reads = vi.fn();
    app.decorate('userStore', { listAll: reads, getById: reads, update: reads });
    app.setErrorHandler((error, _req, reply) => reply.code((error as unknown as { status?: number }).status ?? 500).send({ error: error.message }));
    app.addHook('preHandler', async req => { req.user = { sub: 'member-a', role: 'user', email: 'a@example.invalid', iat: 0, exp: 9999999999 }; });
    await app.register(usersRoutes);
    try {
      const response = await app.inject({ method, url, ...(payload ? { payload } : {}) });
      expect(response.statusCode).toBe(403);
      expect(reads).not.toHaveBeenCalled();
    } finally { await app.close(); }
  });
  it('rejects direct read, mutation and tracking-role access before downstream work', async () => {
    const store = new OfferStore({} as Redis, 'fixture-only');
    vi.spyOn(store, 'get').mockImplementation(async id => ({ ...offers.find(o => o.id === id)!, memberIds: ['member-b'] }));
    await expect(store.assertAccess('offer-a', 'member-b')).rejects.toMatchObject({ status: 404 });
    await expect(store.assertManager('offer-a', 'member-b')).rejects.toMatchObject({ status: 404 });
    await expect(store.requireRole('offer-a', 'member-b', ['tracking_manager'])).rejects.toMatchObject({ status: 404 });
    expect((await store.assertAccess('offer-a', 'member-a')).id).toBe('offer-a');
    expect((await store.assertAccess('offer-a', 'global-admin', true)).id).toBe('offer-a');
  });

  it('filters actual list route by ownership and protects financial snapshot reads', async () => {
    const store = new OfferStore({} as Redis, 'fixture-only');
    vi.spyOn(store, 'listAll').mockResolvedValue(offers.map(o => ({ ...o, memberIds: [...o.memberIds] })));
    vi.spyOn(store, 'update').mockImplementation(async id => ({ ...offers.find(o => o.id === id)!, memberIds: ['member-a'] }));
    vi.spyOn(store, 'get').mockImplementation(async id => ({ ...offers.find(o => o.id === id)!, memberIds: ['member-b'] }));
    const reads = vi.fn(async () => []);
    const app = Fastify();
    app.decorate('offerStore', store);
    app.decorate('snapshotStore', { list: reads });
    app.setErrorHandler((error, _req, reply) => reply.code((error as unknown as { status?: number }).status ?? 500).send({ error: error.message }));
    app.addHook('preHandler', async req => {
      req.user = { sub: String(req.headers['x-fixture-user'] ?? 'member-b'), role: req.headers['x-fixture-admin'] === 'yes' ? 'admin' : 'user', email: 'fixture@example.invalid', iat: 0, exp: 9999999999 };
    });
    await app.register(offersRoutes);
    try {
      const list = await app.inject('/offers');
      expect(list.statusCode).toBe(200);
      expect(list.json().offers.map((o: { id: string }) => o.id)).toEqual(['offer-b']);
      expect(list.body).not.toContain('Private A');
      const updated = await app.inject({ method: 'PATCH', url: '/offers/offer-b', payload: { name: 'Own offer' } });
      expect(updated.statusCode).toBe(200);
      expect(updated.json()).not.toHaveProperty('member_ids');
      const denied = await app.inject('/offers/offer-a/snapshots');
      expect(denied.statusCode).toBe(404);
      expect(reads).not.toHaveBeenCalled();
      const admin = await app.inject({ url: '/offers', headers: { 'x-fixture-user': 'global-admin', 'x-fixture-admin': 'yes' } });
      expect(admin.statusCode).toBe(200);
      expect(admin.json().offers).toHaveLength(2);
    } finally { await app.close(); }
  });
});
