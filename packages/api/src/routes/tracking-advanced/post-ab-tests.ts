import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { saoPauloParts } from '../../services/intraday-store.js';
import { saoPauloDayRange } from '../../services/utmify-sync.js';
import type { createCnameTargetContext } from './cname-target-context.js';
import { AbControlSchema, AbSchema, databaseUnavailable, parsed } from './database-unavailable.js';

export function registerPostAbTestsRoutes(
  app: FastifyInstance,
  context0: ReturnType<typeof createCnameTargetContext>,
) {
  const { cnameTarget, redirectUrl, entryUrl, upsellUrl, project } = context0;

  app.post<{ Params: { id: string } }>('/offers/:id/tracking/ab-tests', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
    const body = parsed(AbSchema, req.body);
    const testId = ulid();
    await app.db.begin(async (sql) => {
      await sql`
        UPDATE tracking_ab_tests t SET status='paused'
        WHERE t.project_id=${p.id} AND t.status='active'
          AND NOT EXISTS (SELECT 1 FROM tracking_entry_links el WHERE el.ab_test_id=t.id)
      `;
      await sql`INSERT INTO tracking_ab_tests(id, project_id, name, kind, traffic_a)
        VALUES (${testId}, ${p.id}, ${body.name}, ${body.kind}, ${body.traffic_a ?? 50})`;
      for (let index = 0; index < 2; index += 1) {
        const variant = body.variants[index]!;
        await sql`INSERT INTO tracking_ab_variants
          (id, test_id, label, gateway, destination_url, position)
          VALUES (${ulid()}, ${testId}, ${variant.label}, ${variant.gateway ?? null},
            ${variant.destination_url ?? null}, ${index + 1})`;
      }
    });
    return reply.code(201).send({ id: testId, status: 'active' });
  });

  app.get<{
    Params: { id: string; testId: string };
    Querystring: { from?: string; to?: string };
  }>('/offers/:id/tracking/ab-tests/:testId/metrics', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
    const today = saoPauloParts(new Date()).date;
    const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from ?? '') ? req.query.from! : today;
    const toDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to ?? '') ? req.query.to! : fromDate;
    const fromInstant = new Date(saoPauloDayRange(fromDate).from);
    const toInstant = new Date(saoPauloDayRange(toDate).to);
    const rows = await app.db`
        SELECT v.id, v.label, v.position, v.destination_url,
               count(DISTINCT a.visitor_id) FILTER (
                 WHERE a.created_at >= ${fromInstant} AND a.created_at < ${toInstant}
               )::int AS visitors,
               (SELECT count(*)::int FROM tracking_events e
                WHERE e.project_id=t.project_id
                  AND e.event_name='InitiateCheckout'
                  AND e.received_at >= ${fromInstant} AND e.received_at < ${toInstant}
                  AND (
                    e.properties->>'ab_variant_id'=v.id
                    OR (
                      NOT (e.properties ? 'ab_variant_id')
                      AND e.visitor_id IN (
                        SELECT aa.visitor_id FROM tracking_ab_assignments aa
                        WHERE aa.variant_id=v.id
                      )
                    )
                  )) AS checkouts,
               (SELECT count(*)::int FROM tracking_orders o
                WHERE o.project_id=t.project_id
                  AND o.occurred_at >= ${fromInstant} AND o.occurred_at < ${toInstant}
                  AND (
                    o.attribution_source->>'ab_variant_id'=v.id
                    OR EXISTS (
                      SELECT 1 FROM tracking_ab_assignments aa
                      WHERE aa.variant_id=v.id AND aa.visitor_id=o.visitor_id
                        AND aa.created_at <= o.occurred_at
                    )
                  )) AS orders,
               (SELECT count(*)::int FROM tracking_orders o
                WHERE o.project_id=t.project_id AND o.status='paid'
                  AND o.occurred_at >= ${fromInstant} AND o.occurred_at < ${toInstant}
                  AND (
                    o.attribution_source->>'ab_variant_id'=v.id
                    OR EXISTS (
                      SELECT 1 FROM tracking_ab_assignments aa
                      WHERE aa.variant_id=v.id AND aa.visitor_id=o.visitor_id
                        AND aa.created_at <= o.occurred_at
                    )
                  )) AS paid_orders,
               (SELECT count(DISTINCT COALESCE(
                  NULLIF(lower(trim(o.buyer->>'email')), ''),
                  NULLIF(regexp_replace(o.buyer->>'phone', '\D', '', 'g'), ''),
                  NULLIF(trim(o.visitor_id), ''),
                  o.external_id
                ))::int FROM tracking_orders o
                WHERE o.project_id=t.project_id AND o.status='paid' AND o.order_kind='front'
                  AND o.occurred_at >= ${fromInstant} AND o.occurred_at < ${toInstant}
                  AND (
                    o.attribution_source->>'ab_variant_id'=v.id
                    OR EXISTS (
                      SELECT 1 FROM tracking_ab_assignments aa
                      WHERE aa.variant_id=v.id AND aa.visitor_id=o.visitor_id
                        AND aa.created_at <= o.occurred_at
                    )
                  )) AS front_buyers,
               (SELECT COALESCE(sum(
                  COALESCE(
                    o.amount_brl_minor,
                    CASE WHEN upper(o.currency)='BRL' THEN o.amount_minor END,
                    0
                  )
                ), 0)::bigint FROM tracking_orders o
                WHERE o.project_id=t.project_id AND o.status='paid'
                  AND o.occurred_at >= ${fromInstant} AND o.occurred_at < ${toInstant}
                  AND (
                    o.attribution_source->>'ab_variant_id'=v.id
                    OR EXISTS (
                      SELECT 1 FROM tracking_ab_assignments aa
                      WHERE aa.variant_id=v.id AND aa.visitor_id=o.visitor_id
                        AND aa.created_at <= o.occurred_at
                    )
                  )) AS revenue_brl_minor
        FROM tracking_ab_variants v
        JOIN tracking_ab_tests t ON t.id = v.test_id
        LEFT JOIN tracking_ab_assignments a ON a.variant_id = v.id
        WHERE t.id = ${req.params.testId} AND t.project_id = ${p.id}
        GROUP BY v.id, v.label, v.position, v.destination_url, t.project_id
        ORDER BY v.position
      `;
    return { variants: rows };
  });

  app.patch<{ Params: { id: string; testId: string } }>(
    '/offers/:id/tracking/ab-tests/:testId',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
      const body = parsed(AbControlSchema, req.body);
      if (body.action === 'update_config') {
        const existing = await app.db<Array<{ id: string }>>`
          SELECT v.id FROM tracking_ab_variants v
          JOIN tracking_ab_tests t ON t.id=v.test_id
          WHERE t.id=${req.params.testId} AND t.project_id=${p.id}
            AND v.id IN (${body.variants[0]!.id},${body.variants[1]!.id})
        `;
        if (existing.length !== 2) {
          return reply.code(400).send({ error: 'ab_variants_mismatch' });
        }
        await app.db.begin(async (sql) => {
          await sql`UPDATE tracking_ab_tests
            SET name=${body.name},traffic_a=${body.traffic_a}
            WHERE id=${req.params.testId} AND project_id=${p.id} AND deleted_at IS NULL`;
          for (const variant of body.variants) {
            await sql`UPDATE tracking_ab_variants
              SET label=${variant.label},destination_url=${variant.destination_url}
              WHERE id=${variant.id} AND test_id=${req.params.testId}`;
          }
        });
      } else if (body.action === 'resume') {
        await app.db.begin(async (sql) => {
          await sql`
            UPDATE tracking_ab_tests t SET status='paused'
            WHERE t.project_id=${p.id} AND t.status='active'
              AND NOT EXISTS (SELECT 1 FROM tracking_entry_links el WHERE el.ab_test_id=t.id)
              AND NOT EXISTS (
                SELECT 1 FROM tracking_entry_links selected
                WHERE selected.ab_test_id=${req.params.testId}
              )
          `;
          await sql`UPDATE tracking_ab_tests SET status='active'
            WHERE id=${req.params.testId} AND project_id=${p.id} AND deleted_at IS NULL`;
        });
      } else if (body.action === 'pause') {
        await app.db`UPDATE tracking_ab_tests SET status='paused'
          WHERE id=${req.params.testId} AND project_id=${p.id}`;
      } else {
        const variants = await app.db`
          SELECT v.id FROM tracking_ab_variants v
          JOIN tracking_ab_tests t ON t.id=v.test_id
          WHERE v.id=${body.variant_id} AND t.id=${req.params.testId} AND t.project_id=${p.id}
        `;
        if (variants.length === 0) return reply.code(404).send({ error: 'ab_variant_not_found' });
        await app.db`UPDATE tracking_ab_tests
          SET winner_variant_id=${body.variant_id}, winner_locked_at=now(), status='active'
          WHERE id=${req.params.testId} AND project_id=${p.id}`;
      }
      return { updated: true };
    },
  );

  app.delete<{ Params: { id: string; testId: string } }>(
    '/offers/:id/tracking/ab-tests/:testId',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (p)
        await app.db`UPDATE tracking_ab_tests SET status='deleted', deleted_at=now()
        WHERE id=${req.params.testId} AND project_id=${p.id}`;
      return reply.code(204).send();
    },
  );
}
