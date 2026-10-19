import type { FastifyInstance } from 'fastify';
import { NotFoundError, zodToProblem } from '../../lib/problem.js';
import {
  type TrackingPeriodQuery,
  UtmifyPixelSchema,
  databaseUnavailable,
  parseTrackingDate,
} from './pagination-schema.js';

export function registerPutUtmifyPixelRoutes(app: FastifyInstance) {
  app.put<{ Params: { id: string } }>('/offers/:id/tracking/utmify-pixel', async (req, reply) => {
    await app.offerStore.assertTrackingManager(
      req.params.id,
      req.user!.sub,
      req.user!.role === 'admin',
    );
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    const parsed = UtmifyPixelSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error);
    const rows = await app.db<{ id: string }[]>`
      UPDATE tracking_projects
      SET utmify_pixel_id = ${parsed.data.pixel_id}, updated_at = now()
      WHERE offer_id = ${req.params.id} AND enabled = true
      RETURNING id
    `;
    if (!rows[0]) throw new NotFoundError('Projeto de tracking não encontrado.');
    return reply.send({ configured: true, pixel_id: parsed.data.pixel_id });
  });

  app.get<{ Params: { id: string }; Querystring: TrackingPeriodQuery }>(
    '/offers/:id/tracking/utmify-web-events',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { date, from, to } = parseTrackingDate(req.query);
      const rows = await app.db`
        SELECT ue.id, ue.event_id, ue.external_pixel_id AS pixel_id, ue.state, ue.attempts,
               ue.response_status, ue.last_error, ue.created_at, ue.delivered_at,
               te.source->>'campaign_id' AS campaign_id,
               te.source->>'adset_id' AS adset_id,
               te.source->>'ad_id' AS ad_id,
               te.source->>'placement' AS placement,
               ue.response->'lead'->>'_id' AS utmify_lead_id,
               ue.response->'event'->>'_id' AS utmify_event_id
        FROM tracking_utmify_web_events ue
        JOIN tracking_projects p ON p.id = ue.project_id
        JOIN tracking_events te ON te.project_id = ue.project_id AND te.id = ue.event_id
        WHERE p.offer_id = ${req.params.id}
          AND te.received_at >= ${from}
          AND te.received_at < ${to}
        ORDER BY ue.created_at DESC
        LIMIT 100
      `;
      return reply.send({ date, deliveries: rows });
    },
  );

  app.post<{ Params: { id: string; deliveryId: string } }>(
    '/offers/:id/tracking/utmify-web-events/:deliveryId/retry',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const [delivery] = await app.db<{ id: string }[]>`
        UPDATE tracking_utmify_web_events ue
        SET state='pending', last_error=NULL, next_attempt_at=now()
        FROM tracking_projects p
        WHERE ue.id=${req.params.deliveryId}
          AND ue.project_id=p.id
          AND p.offer_id=${req.params.id}
        RETURNING ue.id
      `;
      if (!delivery) throw new NotFoundError('Entrega UTMify não encontrada.');
      await app.utmifyWebEventQueue.add('send', { deliveryId: delivery.id });
      return reply.code(202).send({ accepted: true });
    },
  );
}
