import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  saleNoticeAccessibleOffers,
  saleNoticeSelection,
} from '../services/sale-notice-preferences.js';

const schema = z.union([
  z.object({ offer_ids: z.array(z.string().min(1).max(64)).max(2000) }).strict(),
  // Keep old clients functional during rolling releases.
  z
    .object({ scope: z.enum(['all', 'own']) })
    .strict(),
]);
export async function saleNoticePreferenceRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
  });
  app.get('/tracking/sale-notice-preferences', async (req) => {
    const offers = await saleNoticeAccessibleOffers(app, req.user!);
    const selected = new Set(await saleNoticeSelection(app, req.user!, offers));
    return {
      offer_ids: offers.filter((offer) => selected.has(offer.id)).map((offer) => offer.id),
      offers: offers.map(({ id, name, companyName }) => ({ id, name, company: companyName ?? '' })),
    };
  });
  app.put('/tracking/sale-notice-preferences', async (req, reply) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_selection' });
    const offers = await saleNoticeAccessibleOffers(app, req.user!);
    const allowed = new Set(offers.map((offer) => offer.id));
    const data = parsed.data;
    const ids =
      'offer_ids' in data
        ? [...new Set(data.offer_ids)]
        : offers
            .filter((offer) => data.scope === 'all' || offer.userId === req.user!.sub)
            .map((offer) => offer.id);
    if (ids.some((id) => !allowed.has(id)))
      return reply.code(403).send({ error: 'offer_not_allowed' });
    await app.db!`INSERT INTO sale_notice_preferences(user_id,offer_ids) VALUES(${req.user!.sub},${ids})
      ON CONFLICT(user_id) DO UPDATE SET offer_ids=excluded.offer_ids,updated_at=now()`;
    return { offer_ids: ids };
  });
}
