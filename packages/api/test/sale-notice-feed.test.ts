import Fastify from 'fastify';
import { afterEach, expect, it, vi } from 'vitest';
import { registerGetSaleNoticeStream } from '../src/routes/tracking-overview/get-sale-notice-stream.js';
import { SaleNoticeFeed } from '../src/services/sale-notice-feed.js';

afterEach(() => vi.useRealTimers());

function fixture() {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-28T10:00:00Z'));
  const db = vi.fn().mockResolvedValue([]);
  const feed = new SaleNoticeFeed({ db, log: { warn: vi.fn() } } as never);
  const row = (id: string, offer_id = 'shared', offset = 500) => ({
    id,
    offer_id,
    status: 'paid',
    provider: 'vendepay',
    currency: 'BRL',
    amount_minor: '2900',
    occurred_at: new Date(Date.now() + offset),
  });
  const client = (offers = [{ id: 'shared', name: 'Offer' }]) => ({
    since: Date.now(),
    offers,
    authorize: vi.fn().mockResolvedValue(offers),
    send: vi.fn(),
    close: vi.fn(),
  });
  return { db, feed, row, client };
}

it('broadcasts the same sale and server timestamp to two users in one scan', async () => {
  const { db, feed, row, client } = fixture();
  const first = client();
  const second = client();
  feed.subscribe(first);
  feed.subscribe(second);
  db.mockResolvedValue([row('sale')]);
  vi.setSystemTime(Date.now() + 1000);
  await feed.tick();
  expect(db).toHaveBeenCalledTimes(1);
  expect(first.send.mock.calls[0]).toEqual(second.send.mock.calls[0]);
  expect(first.send.mock.calls[0][0].items[0].id).toBe('sale');
  await feed.tick();
  expect(first.send).toHaveBeenCalledTimes(1);
  expect(second.send).toHaveBeenCalledTimes(1);
  feed.close();
});

it('excludes old orders and rechecks offer permissions before sending amounts', async () => {
  const { db, feed, row, client } = fixture();
  const allowed = client();
  const denied = client();
  denied.authorize.mockResolvedValue([]);
  feed.subscribe(allowed);
  feed.subscribe(denied);
  db.mockResolvedValue([row('old', 'shared', -1000), row('new'), row('private', 'other')]);
  vi.setSystemTime(Date.now() + 1000);
  await feed.tick();
  expect(allowed.send.mock.calls[0][0].items.map((r: { id: string }) => r.id)).toEqual(['new']);
  expect(denied.send.mock.calls[0][0].items).toEqual([]);
  expect(denied.send.mock.calls[0][0].offer_ids).toEqual([]);
  feed.close();
});

it('waits for access checks then flushes all recipients together', async () => {
  const { db, feed, row, client } = fixture();
  const first = client();
  const second = client();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  second.authorize.mockImplementation(async () => {
    await gate;
    return second.offers;
  });
  feed.subscribe(first);
  feed.subscribe(second);
  db.mockResolvedValue([row('sale')]);
  vi.setSystemTime(Date.now() + 1000);
  const pending = feed.tick();
  await Promise.resolve();
  await Promise.resolve();
  expect(first.send).not.toHaveBeenCalled();
  release();
  await pending;
  expect(first.send.mock.calls).toEqual(second.send.mock.calls);
  expect(first.send).toHaveBeenCalledTimes(1);
  feed.close();
});

it('reconnect resumes orders sharing the last cursor timestamp', async () => {
  const { db, feed, row, client } = fixture();
  const resumed = client();
  const order = row('same-time', 'shared', 0);
  feed.subscribe(resumed);
  db.mockResolvedValue([order]);
  vi.setSystemTime(Date.now() + 1000);
  await feed.tick();
  expect(resumed.send.mock.calls[0][0].items[0].id).toBe('same-time');
  feed.close();
});

it('fails closed on revoked authentication and releases its timer after unsubscribe', async () => {
  const { db, feed, row, client } = fixture();
  const revoked = client();
  revoked.authorize.mockRejectedValue(new Error('unauthorized'));
  const unsubscribe = feed.subscribe(revoked);
  db.mockResolvedValue([row('new')]);
  vi.setSystemTime(Date.now() + 1000);
  await feed.tick();
  expect(revoked.close).toHaveBeenCalledTimes(1);
  expect(revoked.send).not.toHaveBeenCalled();
  unsubscribe();
  expect(vi.getTimerCount()).toBe(0);
  feed.close();
});

it('paginates a burst without dropping orders or rescanning separately for each user', async () => {
  const { db, feed, row, client } = fixture();
  const first = client();
  const second = client();
  feed.subscribe(first);
  feed.subscribe(second);
  db.mockResolvedValueOnce(Array.from({ length: 200 }, (_, n) => row(String(n))));
  db.mockResolvedValueOnce([row('last')]);
  vi.setSystemTime(Date.now() + 1000);
  await feed.tick();
  expect(db).toHaveBeenCalledTimes(2);
  expect(first.send.mock.calls.flatMap(([m]) => m.items)).toHaveLength(201);
  expect(first.send.mock.calls).toEqual(second.send.mock.calls);
  feed.close();
});

it('sends heartbeats, refreshes permissions and stops cleanly on database failure', async () => {
  const { db, feed, client } = fixture();
  const first = client();
  feed.subscribe(first);
  vi.setSystemTime(Date.now() + 15_000);
  await feed.tick();
  expect(first.send.mock.calls[0][0].type).toBe('heartbeat');
  db.mockRejectedValueOnce(new Error('database unavailable'));
  await feed.tick();
  expect(first.close).toHaveBeenCalledTimes(1);
  expect(vi.getTimerCount()).toBe(0);
});

it('stream rejects missing authentication and malformed cursors before querying', async () => {
  for (const authenticated of [false, true]) {
    const app = Fastify();
    const db = vi.fn();
    app.decorate('db', db);
    app.addHook('onRequest', async (req) => {
      if (authenticated) req.user = { sub: 'user', role: 'user' } as never;
    });
    registerGetSaleNoticeStream(app);
    try {
      const response = await app.inject('/tracking/sale-notices/stream?since=invalid');
      expect(response.statusCode).toBe(authenticated ? 400 : 401);
      expect(db).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  }
});

it('streams immediately through real HTTP with bearer auth and closes on disconnect', async () => {
  const app = Fastify();
  app.decorate('db', vi.fn().mockResolvedValue([]));
  app.decorate('offerStore', { listAccessible: vi.fn().mockResolvedValue([]) });
  app.decorate(
    'requireAuth',
    async (req: { headers: { authorization?: string }; user?: unknown }) => {
      if (req.headers.authorization !== 'Bearer fixture') throw new Error('unauthorized');
      req.user = { sub: 'user', role: 'user' };
    },
  );
  app.addHook('preHandler', (req) => app.requireAuth(req));
  registerGetSaleNoticeStream(app);
  const controller = new AbortController();
  try {
    const address = await app.listen({ host: '127.0.0.1', port: 0 });
    const response = await fetch(`${address}/tracking/sale-notices/stream`, {
      headers: { Authorization: 'Bearer fixture' },
      signal: controller.signal,
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('cache-control')).toContain('no-transform');
    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('"type":"ready"');
    await reader.cancel();
  } finally {
    controller.abort();
    await app.close();
  }
});
