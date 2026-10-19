import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';

export function registerPostUtmifyUpsellsReconcileRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/utmify-upsells/reconcile',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });

      const [project] = await app.db<{ id: string }[]>`
        SELECT id FROM tracking_projects
        WHERE offer_id=${req.params.id} AND enabled=true
        LIMIT 1
      `;
      if (!project) return reply.code(409).send({ error: 'tracking_not_configured' });

      const result = await app.db.begin(async (sql) => {
        const repaired = await sql<{ id: string }[]>`
          WITH matches AS (
            SELECT u.id, f.visitor_id AS front_visitor_id,
                   f.attribution_source AS front_attribution_source
            FROM tracking_orders u
            JOIN LATERAL (
              SELECT f.visitor_id, f.attribution_source
              FROM tracking_orders f
              WHERE f.project_id=u.project_id
                AND f.status='paid'
                AND f.order_kind='front'
                AND f.occurred_at <= u.occurred_at
                AND f.occurred_at >= u.occurred_at - interval '30 days'
                AND (
                  (NULLIF(u.visitor_id, '') IS NOT NULL AND f.visitor_id=u.visitor_id)
                  OR (NULLIF(u.buyer->>'email', '') IS NOT NULL
                    AND lower(f.buyer->>'email')=lower(u.buyer->>'email'))
                  OR (NULLIF(u.buyer->>'phone', '') IS NOT NULL
                    AND regexp_replace(f.buyer->>'phone','\\D','','g')=
                        regexp_replace(u.buyer->>'phone','\\D','','g'))
                )
              ORDER BY f.occurred_at DESC
              LIMIT 1
            ) f ON true
            WHERE u.project_id=${project.id}
              AND u.status='paid'
              AND (u.order_kind='upsell' OR u.order_kind ~ '^upsell_[2-9][0-9]*$')
          )
          UPDATE tracking_orders u
          SET visitor_id=COALESCE(u.visitor_id, matches.front_visitor_id),
              attribution_source=matches.front_attribution_source || u.attribution_source,
              updated_at=now()
          FROM matches
          WHERE u.id=matches.id
          RETURNING u.id
        `;
        const orderIds = repaired.map((row) => row.id);
        const deliveries = orderIds.length
          ? await sql<{ id: string }[]>`
              UPDATE tracking_delivery_outbox
              SET state='pending', last_error=NULL, next_attempt_at=now(), delivered_at=NULL
              WHERE project_id=${project.id}
                AND destination_kind='utmify'
                AND order_id IN ${sql(orderIds)}
                AND event_type='order.paid'
                AND destination_id IN (
                  SELECT id FROM tracking_utmify_destinations
                  WHERE project_id=${project.id} AND scope='offer'
                )
              RETURNING id
            `
          : [];
        return { repaired: repaired.length, deliveries };
      });

      await Promise.allSettled(
        result.deliveries.map(({ id }) =>
          app.utmifyDeliveryQueue.add(
            'send',
            { deliveryId: id },
            { jobId: `${id}-upsell-${Date.now()}` },
          ),
        ),
      );
      return reply.code(202).send({
        upsells_repaired: result.repaired,
        utmify_queued: result.deliveries.length,
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/utmify-test-checkout',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });

      const [project] = await app.db<{ id: string }[]>`
        SELECT id
        FROM tracking_projects
        WHERE offer_id = ${req.params.id} AND enabled = true
      `;
      if (!project) return reply.code(409).send({ error: 'tracking_not_configured' });

      const [destination] = await app.db<{ id: string }[]>`
        SELECT id
        FROM tracking_utmify_destinations
        WHERE project_id = ${project.id} AND enabled = true AND scope='offer'
      `;
      if (!destination) return reply.code(409).send({ error: 'utmify_not_configured' });

      const now = new Date();
      const suffix = ulid();
      const transactionId = `TMX-TEST-IC-${suffix}`;
      const orderId = ulid();
      const deliveryId = ulid();
      const eventId = `tmx-test:${transactionId}:waiting_payment`;

      await app.db.begin(async (sql) => {
        await sql`
          INSERT INTO tracking_orders
            (id, project_id, provider, external_id, status, amount_minor, currency,
             visitor_id, buyer, raw_status, occurred_at, paid_at, payment_method,
             product, attribution_source)
          VALUES
            (${orderId}, ${project.id}, 'tmx-test', ${transactionId}, 'pending', 100, 'BRL',
             NULL, ${sql.json({
               name: 'Cliente Teste TMX',
               email: `teste+${suffix.toLowerCase()}@theminex.com`,
               phone: '5511999999999',
             })}, 'waiting_payment', ${now}, NULL, 'pix',
             ${sql.json({ id: 'tmx-test-product', name: 'Checkout de teste TMX' })},
             ${sql.json({
               src: `tmx_test_${suffix}`,
               utm_source: 'tmx',
               utm_medium: 'integration_test',
               utm_campaign: 'utmify_checkout_test',
               utm_content: 'initiate_checkout',
             })})
        `;
        await sql`
          INSERT INTO tracking_delivery_outbox
            (id, project_id, destination_kind, destination_id, order_id, event_id, event_type)
          VALUES
            (${deliveryId}, ${project.id}, 'utmify', ${destination.id}, ${orderId},
             ${eventId}, 'order.waiting_payment.test')
        `;
      });

      await app.utmifyDeliveryQueue.add('send', { deliveryId });
      return reply.code(202).send({
        accepted: true,
        delivery_id: deliveryId,
        transaction_id: transactionId,
        status: 'waiting_payment',
        is_test: true,
      });
    },
  );
}
