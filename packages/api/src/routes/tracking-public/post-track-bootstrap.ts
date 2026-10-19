import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { collectNetworkIdentifiers } from '../../lib/network-detection.js';
import { createTrackingToken } from '../../lib/tracking-token.js';
import { readRotatingTrackingToken } from './attribution.js';
import { requestCountry } from './browser-request.js';
import { AbAssignmentSchema, BootstrapSchema } from './request-schemas.js';

export function registerPostTrackBootstrapRoutes(app: FastifyInstance) {
  app.post('/track/bootstrap', { bodyLimit: 64 * 1024 }, async (req, reply) => {
    if (!app.db) return reply.code(503).send({ accepted: false });
    const parsed = BootstrapSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ accepted: false });
    const input = parsed.data;
    const [project] = await app.db<{ id: string; enabled: boolean }[]>`
      SELECT id, enabled FROM tracking_projects WHERE public_key = ${input.public_key}
    `;
    if (!project?.enabled) return reply.code(404).send({ accepted: false });
    const linkedIdentity = input.tracking_token
      ? readRotatingTrackingToken(input.tracking_token, req)
      : null;
    const visitorId =
      linkedIdentity?.projectId === project.id ? linkedIdentity.visitorId : input.visitor_id;
    const journeyId =
      linkedIdentity?.projectId === project.id ? linkedIdentity.journeyId : input.journey_id;
    const country = requestCountry(req.headers);
    const source = country ? { ...input.source, country } : input.source;
    const clickIds = collectNetworkIdentifiers(source);
    await app.db.begin(async (sql) => {
      await sql`
        INSERT INTO tracking_visitors
          (project_id, visitor_id, first_source, last_source, click_ids)
        VALUES
          (${project.id}, ${visitorId}, ${sql.json(source)}, ${sql.json(source)},
           ${sql.json(clickIds)})
        ON CONFLICT (project_id, visitor_id) DO UPDATE SET
          last_source = CASE
            WHEN EXCLUDED.last_source = '{}'::jsonb THEN tracking_visitors.last_source
            ELSE tracking_visitors.last_source || EXCLUDED.last_source
          END,
          click_ids = CASE
            WHEN tracking_visitors.click_ids = '{}'::jsonb THEN EXCLUDED.click_ids
            ELSE tracking_visitors.click_ids
          END,
          last_seen_at = now()
      `;
      await sql`
        INSERT INTO tracking_sessions
          (project_id, session_id, visitor_id, journey_id, landing_url, referrer, source, click_ids)
        VALUES
          (${project.id}, ${input.session_id}, ${visitorId}, ${journeyId},
           ${input.landing_url}, ${input.referrer || null}, ${sql.json(source)},
           ${sql.json(clickIds)})
        ON CONFLICT (project_id, session_id) DO UPDATE SET
          source = tracking_sessions.source || EXCLUDED.source,
          click_ids = tracking_sessions.click_ids || EXCLUDED.click_ids,
          last_seen_at = now()
      `;
    });
    return {
      accepted: true,
      visitor_id: visitorId,
      journey_id: journeyId,
      tracking_token: createTrackingToken(
        { projectId: project.id, visitorId, journeyId },
        env.WEBHOOK_SECRET,
      ),
    };
  });

  app.post('/track/ab/assign', { bodyLimit: 16 * 1024 }, async (req, reply) => {
    if (!app.db) return reply.code(503).send({ active: false });
    const parsed = AbAssignmentSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ active: false });
    const input = parsed.data;
    const [test] = await app.db<
      Array<{
        id: string;
        kind: 'checkout' | 'presell';
        traffic_a: number;
        winner_variant_id: string | null;
      }>
    >`
      SELECT t.id, t.kind, t.traffic_a, t.winner_variant_id
      FROM tracking_ab_tests t
      JOIN tracking_projects p ON p.id = t.project_id
      WHERE p.public_key = ${input.public_key}
        AND p.enabled = true
        AND t.status = 'active'
        AND t.deleted_at IS NULL
        AND NOT EXISTS (
          SELECT 1 FROM tracking_entry_links el WHERE el.ab_test_id = t.id
        )
      ORDER BY t.created_at DESC
      LIMIT 1
    `;
    if (!test) return { active: false };
    const variants = await app.db<
      Array<{
        id: string;
        label: string;
        gateway: string | null;
        destination_url: string | null;
        position: number;
      }>
    >`
      SELECT id, label, gateway, destination_url, position
      FROM tracking_ab_variants
      WHERE test_id = ${test.id}
      ORDER BY position
    `;
    if (variants.length !== 2) return { active: false };
    const existing = await app.db<Array<{ variant_id: string }>>`
      SELECT variant_id FROM tracking_ab_assignments
      WHERE test_id = ${test.id} AND visitor_id = ${input.visitor_id}
    `;
    const digest = createHash('sha256')
      .update(`${test.id}|${input.visitor_id}`)
      .digest()
      .readUInt32BE(0);
    const selectedId =
      test.winner_variant_id ??
      existing[0]?.variant_id ??
      (digest % 100 < test.traffic_a ? variants[0]!.id : variants[1]!.id);
    const selected = variants.find((variant) => variant.id === selectedId) ?? variants[0]!;
    await app.db`
      INSERT INTO tracking_ab_assignments(id, test_id, variant_id, visitor_id)
      VALUES (${ulid()}, ${test.id}, ${selected.id}, ${input.visitor_id})
      ON CONFLICT(test_id, visitor_id) DO NOTHING
    `;
    return {
      active: true,
      test_id: test.id,
      kind: test.kind,
      variant: selected,
    };
  });
}
