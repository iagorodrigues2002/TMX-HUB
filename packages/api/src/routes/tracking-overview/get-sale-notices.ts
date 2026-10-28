import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

const querySchema = z.object({
  since: z.string().datetime(),
  after_id: z.string().max(64).default(''),
});

export function registerGetSaleNotices(app: FastifyInstance) {
  app.get('/tracking/sale-notices', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'unauthorized' });
    const parsed = querySchema.safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_cursor' });
    const since = new Date(parsed.data.since);
    if (+since > Date.now() || +since < Date.now() - 86_400_000)
      return reply.code(400).send({ error: 'invalid_cursor' });
    if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
    const offers = await app.offerStore.listAccessible(req.user.sub, req.user.role === 'admin');
    if (!offers.length) return { items: [], next: null, offer_ids: [] };
    const ids = offers.map((offer) => offer.id);
    const names = new Map(offers.map((offer) => [offer.id, offer.name]));
    const rows = await app.db<
      {
        id: string;
        status: string;
        provider: string;
        amount_minor: string | null;
        currency: string;
        occurred_at: Date;
        offer_id: string;
      }[]
    >`
      SELECT o.id,o.status,o.provider,o.amount_minor,o.currency,o.occurred_at,p.offer_id
      FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
      WHERE p.offer_id=ANY(${ids}) AND o.status='paid'
        AND (o.occurred_at>${since} OR (o.occurred_at=${since} AND o.id>${parsed.data.after_id}))
        AND o.occurred_at<=now()
      ORDER BY o.occurred_at,o.id LIMIT 201
    `;
    const items = rows.slice(0, 200).map((row) => ({
      ...row,
      offerId: row.offer_id,
      offerName: names.get(row.offer_id),
    }));
    const last = items.at(-1);
    return {
      items,
      offer_ids: ids,
      next:
        rows.length > 200 && last
          ? { since: new Date(last.occurred_at).toISOString(), after_id: last.id }
          : null,
    };
  });
}
