import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import type { createCnameTargetContext } from './cname-target-context.js';
import {
  EntryLinkAbSchema,
  EntryLinkSchema,
  EntryLinkUpdateSchema,
  ProductKindSchema,
  databaseUnavailable,
  parsed,
} from './database-unavailable.js';

export function registerDeleteUpsellsStageIdRoutes(
  app: FastifyInstance,
  context0: ReturnType<typeof createCnameTargetContext>,
) {
  const { cnameTarget, redirectUrl, entryUrl, upsellUrl, project } = context0;

  app.delete<{ Params: { id: string; stageId: string } }>(
    '/offers/:id/tracking/upsells/:stageId',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
      const [removed] = await app.db<Array<{ id: string; stage_key: string }>>`
        DELETE FROM tracking_upsell_stages
        WHERE id=${req.params.stageId} AND project_id=${p.id}
        RETURNING id,stage_key
      `;
      if (!removed) return reply.code(404).send({ error: 'upsell_stage_not_found' });
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string } }>('/offers/:id/tracking/entry-links', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p) return reply.code(409).send({ error: 'tracking_not_configured' });
    const body = parsed(EntryLinkSchema, req.body);
    const slug = ulid().toLowerCase();
    const [row] = await app.db`
        INSERT INTO tracking_entry_links
          (id, project_id, name, slug, destination_url, traffic_source)
        VALUES (${ulid()}, ${p.id}, ${body.name}, ${slug}, ${body.destination_url}, ${body.traffic_source ?? 'other'})
        RETURNING id, name, slug, destination_url, traffic_source, enabled, created_at, updated_at
      `;
    return reply.code(201).send({ ...row, tracking_url: entryUrl(slug) });
  });

  app.patch<{ Params: { id: string; linkId: string } }>(
    '/offers/:id/tracking/entry-links/:linkId',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
      const body = parsed(EntryLinkUpdateSchema, req.body);
      const [row] = await app.db`
        UPDATE tracking_entry_links
        SET name = COALESCE(${body.name ?? null}, name),
            destination_url = ${body.destination_url},
            traffic_source = COALESCE(${body.traffic_source ?? null}, traffic_source),
            updated_at = now()
        WHERE id = ${req.params.linkId} AND project_id = ${p.id}
        RETURNING id, name, slug, destination_url, traffic_source, ab_test_id, enabled, created_at, updated_at
      `;
      if (!row) return reply.code(404).send({ error: 'entry_link_not_found' });
      return reply.send({ ...row, tracking_url: entryUrl(String(row.slug)) });
    },
  );

  app.post<{ Params: { id: string; linkId: string } }>(
    '/offers/:id/tracking/entry-links/:linkId/ab-test',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
      const body = parsed(EntryLinkAbSchema, req.body);
      const testId = ulid();
      const attached = await app.db.begin(async (sql) => {
        const [link] = await sql<{ id: string; ab_test_id: string | null }[]>`
          SELECT id, ab_test_id FROM tracking_entry_links
          WHERE id = ${req.params.linkId} AND project_id = ${p.id}
          FOR UPDATE
        `;
        if (!link || link.ab_test_id) return false;
        await sql`
          INSERT INTO tracking_ab_tests(id, project_id, name, kind, traffic_a)
          VALUES (${testId}, ${p.id}, ${body.name}, 'presell', ${body.traffic_a ?? 50})
        `;
        for (let index = 0; index < 2; index += 1) {
          const variant = body.variants[index]!;
          await sql`
            INSERT INTO tracking_ab_variants
              (id, test_id, label, destination_url, position)
            VALUES
              (${ulid()}, ${testId}, ${variant.label}, ${variant.destination_url}, ${index + 1})
          `;
        }
        await sql`
          UPDATE tracking_entry_links
          SET ab_test_id = ${testId}, updated_at = now()
          WHERE id = ${link.id}
        `;
        return true;
      });
      if (!attached) {
        return reply.code(409).send({ error: 'entry_link_already_has_ab_test' });
      }
      return reply.code(201).send({
        test_id: testId,
        tracking_url: entryUrl(
          (
            await app.db<{ slug: string }[]>`
          SELECT slug FROM tracking_entry_links WHERE id = ${req.params.linkId}
        `
          )[0]!.slug,
        ),
      });
    },
  );

  app.delete<{ Params: { id: string; linkId: string } }>(
    '/offers/:id/tracking/entry-links/:linkId',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
      await app.db.begin(async (sql) => {
        await sql`
          UPDATE tracking_ab_tests
          SET status = 'deleted', deleted_at = now()
          WHERE id = (
            SELECT ab_test_id FROM tracking_entry_links
            WHERE id = ${req.params.linkId} AND project_id = ${p.id}
          )
        `;
        await sql`
          DELETE FROM tracking_entry_links
          WHERE id=${req.params.linkId} AND project_id=${p.id}
        `;
      });
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { id: string } }>('/offers/:id/tracking/product-kinds', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p) return { configured: false, mapped: [], unmapped: [] };
    const [mapped, unmapped] = await Promise.all([
      app.db`
        SELECT id, product_id, kind, label, created_at, updated_at
        FROM tracking_product_kinds
        WHERE project_id = ${p.id}
        ORDER BY updated_at DESC`,
      app.db`
        SELECT o.product->>'id' AS product_id,
               max(o.product->>'name') AS product_name,
               count(*)::int AS orders,
               max(o.occurred_at) AS last_seen_at
        FROM tracking_orders o
        WHERE o.project_id = ${p.id}
          AND o.order_kind = 'unknown'
          AND NULLIF(o.product->>'id', '') IS NOT NULL
        GROUP BY o.product->>'id'
        ORDER BY max(o.occurred_at) DESC
        LIMIT 50`,
    ]);
    return { configured: true, mapped, unmapped };
  });

  app.put<{ Params: { id: string } }>('/offers/:id/tracking/product-kinds', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p) return reply.code(409).send({ error: 'tracking_not_configured' });
    const body = parsed(ProductKindSchema, req.body);
    const result = await app.db.begin(async (sql) => {
      const [row] = await sql`
        INSERT INTO tracking_product_kinds (id, project_id, product_id, kind, label)
        VALUES (${ulid()}, ${p.id}, ${body.product_id}, ${body.kind}, ${body.label ?? null})
        ON CONFLICT (project_id, product_id) DO UPDATE SET
          kind = EXCLUDED.kind, label = EXCLUDED.label, updated_at = now()
        RETURNING id, product_id, kind, label, created_at, updated_at
      `;
      const orders = await sql`
        UPDATE tracking_orders SET order_kind=${body.kind},updated_at=now()
        WHERE project_id=${p.id} AND product->>'id'=${body.product_id}
          AND order_kind<>${body.kind} RETURNING id`;
      return { ...row, orders_updated: orders.length };
    });
    return reply.code(201).send(result);
  });

  app.delete<{ Params: { id: string; productId: string } }>(
    '/offers/:id/tracking/product-kinds/:productId',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
      await app.db`
        DELETE FROM tracking_product_kinds
        WHERE project_id = ${p.id} AND product_id = ${req.params.productId}
      `;
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/product-kinds/recompute',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(409).send({ error: 'tracking_not_configured' });
      // Backfills existing orders whose product was mapped to front/upsell *after*
      // the order was first recorded (the webhook path only classifies at insert time).
      const updated = await app.db`
        UPDATE tracking_orders o
        SET order_kind = k.kind, updated_at = now()
        FROM tracking_product_kinds k
        WHERE o.project_id = ${p.id}
          AND k.project_id = o.project_id
          AND k.product_id = o.product->>'id'
          AND o.order_kind <> k.kind
        RETURNING o.id
      `;
      return reply.send({ updated: updated.length });
    },
  );
}
