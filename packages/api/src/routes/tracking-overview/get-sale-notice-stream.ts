import { PassThrough } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { SaleNoticeFeed } from '../../services/sale-notice-feed.js';

const querySchema = z.object({ since: z.string().datetime().optional() });

export function registerGetSaleNoticeStream(app: FastifyInstance) {
  const feed = new SaleNoticeFeed(app);
  app.addHook('preClose', async () => feed.close());
  app.get('/tracking/sale-notices/stream', { config: { compress: false } }, async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_cursor' });
    const now = Date.now();
    const since = parsed.data.since ? +new Date(parsed.data.since) : now;
    if (since > now + 60_000 || since < now - 86_400_000)
      return reply.code(400).send({ error: 'invalid_cursor' });
    if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
    const authorize = async () => {
      await app.requireAuth(req);
      if (
        req.user!.tools?.length &&
        req.user!.role !== 'admin' &&
        !req.user!.tools.includes('ofertas')
      )
        throw new Error('tool_forbidden');
      return app.offerStore.listAccessible(req.user!.sub, req.user!.role === 'admin');
    };
    const offers = await authorize();
    const stream = new PassThrough();
    const close = () => stream.end();
    const send = (message: object) => {
      if (stream.destroyed || stream.writableEnded) return;
      if (!stream.write(`data: ${JSON.stringify(message)}\n\n`)) close();
    };
    const unsubscribe = feed.subscribe({
      since: Math.min(since, now),
      offers,
      authorize,
      send,
      close,
    });
    const lifetime = setTimeout(close, 5 * 60_000);
    lifetime.unref();
    stream.once('close', () => {
      clearTimeout(lifetime);
      unsubscribe();
    });
    send({ type: 'ready', at: new Date(now), offer_ids: offers.map((offer) => offer.id) });
    return reply
      .header('Content-Type', 'text/event-stream; charset=utf-8')
      .header('Cache-Control', 'no-cache, no-store, no-transform')
      .header('X-Accel-Buffering', 'no')
      .send(stream);
  });
}
