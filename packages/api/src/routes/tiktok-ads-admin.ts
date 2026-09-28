import type { FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { TikTokDestinationSchema, TikTokTestSchema } from '../integrations/tiktok/contracts.js';
import { encryptSecret } from '../lib/secret-box.js';
import { env } from '../env.js';

const plugin: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>('/offers/:id/tracking/tiktok/destinations', async (req, reply) => {
    await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
    const destinations = await app.db`SELECT d.id,d.name,d.pixel_code,d.enabled,d.created_at,d.updated_at,
      (SELECT count(*)::int FROM tracking_tiktok_deliveries td WHERE td.destination_id=d.id AND td.created_at>=now()-interval '7 days') deliveries_7d,
      (SELECT count(*)::int FROM tracking_tiktok_deliveries td WHERE td.destination_id=d.id AND td.state='delivered' AND td.created_at>=now()-interval '7 days') delivered_7d,
      (SELECT max(td.delivered_at) FROM tracking_tiktok_deliveries td WHERE td.destination_id=d.id AND td.state='delivered') last_delivered_at
      FROM tracking_tiktok_destinations d JOIN tracking_projects p ON p.id=d.project_id WHERE p.offer_id=${req.params.id} ORDER BY d.created_at DESC`;
    return { destinations };
  });

  app.post<{ Params: { id: string } }>('/offers/:id/tracking/tiktok/destinations', async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    const parsed = TikTokDestinationSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ error: 'invalid_tiktok_destination', issues: parsed.error.issues });
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY) return reply.code(503).send({ error: 'tracking_secrets_unavailable' });
    const [project] = await app.db`SELECT id FROM tracking_projects WHERE offer_id=${req.params.id}`;
    if (!project) return reply.code(409).send({ error: 'tracking_not_configured' });
    const d = parsed.data;
    const [destination] = await app.db`INSERT INTO tracking_tiktok_destinations(id,project_id,name,pixel_code,access_token_encrypted,enabled)
      VALUES(${ulid()},${project.id},${d.name},${d.pixel_code},${encryptSecret(d.access_token,env.TRACKING_ENCRYPTION_KEY)},${d.enabled})
      ON CONFLICT(project_id,pixel_code) DO NOTHING RETURNING id,name,pixel_code,enabled`;
    if (!destination) return reply.code(409).send({ error: 'tiktok_destination_exists' });
    return reply.code(201).send({ destination });
  });

  app.put<{ Params: { id: string; destinationId: string } }>('/offers/:id/tracking/tiktok/destinations/:destinationId', async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    const parsed = TikTokDestinationSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ error: 'invalid_tiktok_destination', issues: parsed.error.issues });
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY) return reply.code(503).send({ error: 'tracking_secrets_unavailable' });
    const d = parsed.data;
    const [destination] = await app.db`UPDATE tracking_tiktok_destinations d SET name=${d.name},pixel_code=${d.pixel_code},access_token_encrypted=${encryptSecret(d.access_token,env.TRACKING_ENCRYPTION_KEY)},enabled=${d.enabled},updated_at=now()
      FROM tracking_projects p WHERE d.project_id=p.id AND p.offer_id=${req.params.id} AND d.id=${req.params.destinationId}
      RETURNING d.id,d.name,d.pixel_code,d.enabled`;
    if (!destination) return reply.code(404).send({ error: 'tiktok_destination_not_found' });
    return { destination };
  });

  app.delete<{ Params: { id: string; destinationId: string } }>('/offers/:id/tracking/tiktok/destinations/:destinationId', async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
    const [destination] = await app.db`DELETE FROM tracking_tiktok_destinations d USING tracking_projects p WHERE d.project_id=p.id AND p.offer_id=${req.params.id} AND d.id=${req.params.destinationId} RETURNING d.id`;
    if (!destination) return reply.code(404).send({ error: 'tiktok_destination_not_found' });
    return reply.code(204).send();
  });

  // TikTok's Test Events code prevents the event appearing in live reporting.
  // We enqueue it through the exact same worker/payload used by paid orders.
  app.post<{ Params: { id: string; destinationId: string } }>('/offers/:id/tracking/tiktok/destinations/:destinationId/test', async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    const parsed = TikTokTestSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(422).send({ error: 'invalid_tiktok_test', issues: parsed.error.issues });
    if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
    const [destination] = await app.db`SELECT d.id,p.id project_id FROM tracking_tiktok_destinations d JOIN tracking_projects p ON p.id=d.project_id WHERE p.offer_id=${req.params.id} AND d.id=${req.params.destinationId} AND d.enabled=true`;
    if (!destination) return reply.code(404).send({ error: 'tiktok_destination_not_found_or_disabled' });
    const id = ulid();
    await app.db`INSERT INTO tracking_tiktok_deliveries(id,project_id,destination_id,event_id,event_name,test_event_code,state)
      VALUES(${id},${destination.project_id},${destination.id},${`tmx-tiktok-test:${id}`},'Purchase',${parsed.data.test_event_code},'test')`;
    await app.tiktokQueue.add('test', { deliveryId: id }, { jobId: `tiktok-test-${id}` });
    return reply.code(202).send({ delivery_id: id, status: 'queued', detail: 'Teste enviado pela mesma Events API usada nas vendas. Aguarde a confirmação.' });
  });

  app.get<{ Params: { id: string; deliveryId: string } }>('/offers/:id/tracking/tiktok/deliveries/:deliveryId', async (req, reply) => {
    await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
    const [delivery] = await app.db`SELECT td.id,td.state,td.attempts,td.response_status,td.last_error,td.delivered_at,td.created_at,td.test_event_code,
      d.name destination_name,d.pixel_code FROM tracking_tiktok_deliveries td JOIN tracking_tiktok_destinations d ON d.id=td.destination_id JOIN tracking_projects p ON p.id=td.project_id WHERE p.offer_id=${req.params.id} AND td.id=${req.params.deliveryId}`;
    if (!delivery) return reply.code(404).send({ error: 'tiktok_delivery_not_found' });
    return { delivery };
  });
};
export default plugin;
