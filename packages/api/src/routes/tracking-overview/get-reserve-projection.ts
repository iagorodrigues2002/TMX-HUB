import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { saoPauloParts } from '../../services/intraday-store.js';
import { loadReserveProjection } from '../../services/reserve-projection.js';

const querySchema = z.object({ offer_ids: z.string().max(4000).optional() });
export function registerGetReserveProjection(app: FastifyInstance) {
  app.get('/tracking/reserve-projection', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_scope' });
    const accessible = await app.offerStore.listAccessible(req.user.sub, req.user.role === 'admin');
    const requested = parsed.data.offer_ids?.split(',').filter(Boolean);
    if (requested?.some((id) => !accessible.some((offer) => offer.id === id)))
      return reply.code(403).send({ error: 'offer_forbidden' });
    const ids = [
      ...new Set(
        requested ??
          accessible.filter((offer) => offer.userId === req.user!.sub).map((offer) => offer.id),
      ),
    ].sort();
    if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
    const today = saoPauloParts(new Date()).date;
    const scope = createHash('sha256')
      .update(`${req.user.sub}:${ids.join(',')}`)
      .digest('hex');
    const projection = await app.analyticsCache.getOrSet(
      {
        endpoint: 'reserve-projection',
        offerId: scope,
        from: today,
        to: today,
        ttlSeconds: 60,
        tags: ids,
      },
      () => loadReserveProjection(app.db!, ids, today),
    );
    return { ...projection, offer_count: ids.length };
  });
}
