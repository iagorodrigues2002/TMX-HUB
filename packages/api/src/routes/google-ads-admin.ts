import type { FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { GoogleAdsDestinationSchema } from '../integrations/google-ads/contracts.js';

const plugin: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>('/offers/:id/tracking/google-ads/destinations', async (req, reply) => {
    await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
    const destinations = await app.db`
      SELECT d.id, d.name, d.customer_id, d.conversion_action_id, d.mode, d.state,
             d.created_at, d.updated_at
      FROM tracking_google_ads_destinations d
      JOIN tracking_projects p ON p.id=d.project_id
      WHERE p.offer_id=${req.params.id} AND d.state='draft'
      ORDER BY d.created_at DESC
    `;
    return { destinations, delivery_enabled: false, status: 'setup_only' };
  });

  app.post<{ Params: { id: string } }>('/offers/:id/tracking/google-ads/destinations', async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    const parsed = GoogleAdsDestinationSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ error: 'invalid_google_ads_destination', issues: parsed.error.issues });
    if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
    const [project] = await app.db`SELECT id FROM tracking_projects WHERE offer_id=${req.params.id}`;
    if (!project) return reply.code(409).send({ error: 'tracking_not_configured' });
    const data = parsed.data;
    const [destination] = await app.db`
      INSERT INTO tracking_google_ads_destinations(id, project_id, name, customer_id, conversion_action_id)
      VALUES (${ulid()}, ${project.id}, ${data.name}, ${data.customer_id}, ${data.conversion_action_id})
      ON CONFLICT (project_id, customer_id, conversion_action_id) WHERE state='draft' DO NOTHING
      RETURNING id, name, customer_id, conversion_action_id, mode, state
    `;
    if (!destination) return reply.code(409).send({ error: 'google_ads_destination_exists' });
    return reply.code(201).send({ destination, delivery_enabled: false });
  });

  app.put<{ Params: { id: string; destinationId: string } }>(
    '/offers/:id/tracking/google-ads/destinations/:destinationId', async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      const parsed = GoogleAdsDestinationSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(422).send({ error: 'invalid_google_ads_destination', issues: parsed.error.issues });
      if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
      const data = parsed.data;
      try {
        const [destination] = await app.db`
          UPDATE tracking_google_ads_destinations d
          SET name=${data.name}, customer_id=${data.customer_id},
              conversion_action_id=${data.conversion_action_id}, updated_at=now()
          FROM tracking_projects p
          WHERE d.project_id=p.id AND p.offer_id=${req.params.id}
            AND d.id=${req.params.destinationId} AND d.state='draft'
          RETURNING d.id, d.name, d.customer_id, d.conversion_action_id, d.mode, d.state
        `;
        if (!destination) return reply.code(404).send({ error: 'google_ads_destination_not_found' });
        return { destination, delivery_enabled: false };
      } catch (error) {
        if ((error as { code?: string }).code === '23505') {
          return reply.code(409).send({ error: 'google_ads_destination_exists' });
        }
        throw error;
      }
    });

  app.delete<{ Params: { id: string; destinationId: string } }>(
    '/offers/:id/tracking/google-ads/destinations/:destinationId', async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
      const [row] = await app.db`
        UPDATE tracking_google_ads_destinations d SET state='archived', updated_at=now()
        FROM tracking_projects p WHERE d.project_id=p.id AND p.offer_id=${req.params.id}
          AND d.id=${req.params.destinationId} AND d.state='draft' RETURNING d.id
      `;
      if (!row) return reply.code(404).send({ error: 'google_ads_destination_not_found' });
      return reply.code(204).send();
    });
};
export default plugin;
