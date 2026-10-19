import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';

export function registerPostMetaEventsReplayRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/meta-events/replay',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
      const [project] = await app.db<Array<{ id: string }>>`
        SELECT id FROM tracking_projects WHERE offer_id=${req.params.id} AND enabled=true LIMIT 1
      `;
      if (!project) return reply.code(409).send({ error: 'tracking_not_configured' });

      const replay = await app.db.begin(async (sql) => {
        const pixels = await sql<Array<{ id: string }>>`
          SELECT id FROM meta_pixels WHERE project_id=${project.id} AND enabled=true
        `;
        const queued: Array<{ id: string; event_name: string }> = [];
        for (const pixel of pixels) {
          const webEvents = await sql<Array<{ id: string; event_name: string }>>`
            INSERT INTO meta_deliveries AS existing
              (id,project_id,pixel_id,order_id,event_id,event_name,event_at,outgoing_event_id,
               state,attempts,last_error)
            SELECT ${ulid()} || ':' || row_number() OVER (),${project.id},${pixel.id},NULL,
              e.id,e.event_name,e.received_at,e.id,'pending',0,NULL
            FROM tracking_events e
            WHERE e.project_id=${project.id}
              AND e.event_name IN ('PageView','InitiateCheckout')
              AND e.received_at >= now()-interval '6 days 23 hours'
            ON CONFLICT(pixel_id,event_id) DO UPDATE SET
              event_name=EXCLUDED.event_name,event_at=EXCLUDED.event_at,
              outgoing_event_id=EXCLUDED.outgoing_event_id,state='pending',attempts=0,last_error=NULL
            RETURNING id,event_name
          `;
          const purchases = await sql<Array<{ id: string; event_name: string }>>`
            INSERT INTO meta_deliveries AS existing
              (id,project_id,pixel_id,order_id,event_id,event_name,event_at,outgoing_event_id,
               state,attempts,last_error)
            SELECT ${ulid()} || ':' || row_number() OVER (),${project.id},${pixel.id},o.id,
              'vendepay:' || o.external_id || ':purchase','Purchase',
              COALESCE(o.paid_at,o.occurred_at),'vendepay:' || o.external_id || ':purchase',
              'pending',0,NULL
            FROM tracking_orders o
            WHERE o.project_id=${project.id} AND o.status='paid' AND o.order_kind='front'
              AND COALESCE(o.paid_at,o.occurred_at) >= now()-interval '6 days 23 hours'
            ON CONFLICT(pixel_id,event_id) DO UPDATE SET
              order_id=EXCLUDED.order_id,event_name='Purchase',event_at=EXCLUDED.event_at,
              outgoing_event_id=EXCLUDED.outgoing_event_id,state='pending',attempts=0,last_error=NULL
            RETURNING id,event_name
          `;
          queued.push(...webEvents, ...purchases);
        }
        return { pixels: pixels.length, queued };
      });
      await Promise.allSettled(
        replay.queued.map(({ id }) =>
          app.metaQueue.add(
            'send',
            { deliveryId: id },
            { jobId: `${id}-full-replay-${Date.now()}` },
          ),
        ),
      );
      const count = (name: string) =>
        replay.queued.filter((item) => item.event_name === name).length;
      return reply.code(202).send({
        pixels_enabled: replay.pixels,
        pageviews_queued: count('PageView'),
        initiate_checkouts_queued: count('InitiateCheckout'),
        front_purchases_queued: count('Purchase'),
        total_queued: replay.queued.length,
      });
    },
  );

  app.post<{ Params: { id: string; deliveryId: string } }>(
    '/offers/:id/tracking/meta-deliveries/:deliveryId/retry',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send();
      const updated = await app.db<{ id: string }[]>`
        UPDATE meta_deliveries md SET state = 'pending', last_error = NULL
        FROM tracking_projects tp
        WHERE md.id = ${req.params.deliveryId}
          AND md.project_id = tp.id
          AND tp.offer_id = ${req.params.id}
          AND md.state <> 'delivered'
        RETURNING md.id
      `;
      if (!updated[0]) return reply.code(404).send({ error: 'delivery_not_found' });
      await app.metaQueue.add('send', { deliveryId: updated[0].id });
      return reply.code(202).send({ accepted: true });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/meta-deliveries/resend-value-repairs',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send();
      const repaired = await app.db<{ id: string }[]>`
        UPDATE meta_deliveries md
        SET state = 'pending', last_error = NULL,
            outgoing_event_id = md.event_id || ':value-repair:' || extract(epoch from now())::bigint
        FROM tracking_projects tp, tracking_orders o
        WHERE md.project_id = tp.id
          AND md.order_id = o.id
          AND tp.offer_id = ${req.params.id}
          AND md.event_name = 'Purchase'
          AND o.status = 'paid'
          AND o.amount_brl_minor IS NOT NULL
          AND o.converted_at IS NOT NULL
          AND o.converted_at > md.created_at
          AND o.converted_at >= now() - interval '30 minutes'
        RETURNING md.id
      `;
      await Promise.allSettled(
        repaired.map(({ id }) =>
          app.metaQueue.add(
            'send',
            { deliveryId: id },
            { jobId: `${id}-value-repair-${Date.now()}` },
          ),
        ),
      );
      return reply.code(202).send({ repaired_queued: repaired.length });
    },
  );
}
