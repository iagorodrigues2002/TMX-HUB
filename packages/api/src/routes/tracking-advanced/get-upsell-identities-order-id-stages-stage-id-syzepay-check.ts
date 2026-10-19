import type { FastifyInstance } from 'fastify';
import { env } from '../../env.js';
import { zodToProblem } from '../../lib/problem.js';
import { decryptSecret } from '../../lib/secret-box.js';
import { validateSyzepayRecovery } from '../../services/syzepay-upsell.js';
import { checkUpsellCompatibilityDetailed } from '../../services/upsell-compatibility.js';
import type { createCnameTargetContext } from './cname-target-context.js';
import { UpsellManualResultSchema, databaseUnavailable } from './database-unavailable.js';

export function registerGetUpsellIdentitiesOrderIdStagesStageIdSyzepayCheckRoutes(
  app: FastifyInstance,
  context0: ReturnType<typeof createCnameTargetContext>,
) {
  const { cnameTarget, redirectUrl, entryUrl, upsellUrl, project } = context0;

  app.get<{ Params: { id: string; orderId: string; stageId: string } }>(
    '/offers/:id/tracking/upsell-identities/:orderId/stages/:stageId/syzepay-check',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db || !p) return reply.code(404).send({ compatible: false });
      reply.header('cache-control', 'private, no-store');
      const [row] = await app.db<{ session_id: string; destination: string }[]>`
      SELECT o.attribution_source->>'syzepay_session_id' session_id,s.connection_destinations->>'gateway:syzepay' destination
      FROM tracking_orders o JOIN tracking_upsell_stages s ON s.project_id=o.project_id
      WHERE o.id=${req.params.orderId} AND s.id=${req.params.stageId} AND o.project_id=${p.id}
        AND o.provider='syzepay' AND o.order_kind='front' AND o.paid_at IS NOT NULL AND s.enabled`;
      if (!row?.session_id || !row.destination)
        return {
          compatible: false,
          reason: 'Cadastre a URL SyzePay desta etapa; a compra precisa conter sessão.',
        };
      return validateSyzepayRecovery(row.destination, row.session_id);
    },
  );

  app.put<{
    Params: { id: string; orderId: string; stageId: string };
    Body: { result: 'worked' | 'failed' };
  }>(
    '/offers/:id/tracking/upsell-identities/:orderId/stages/:stageId/result',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
      const parsed = UpsellManualResultSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(422).send(zodToProblem(parsed.error));
      const [eligible] = await app.db<Array<{ order_id: string; stage_id: string }>>`
        SELECT o.id AS order_id,s.id AS stage_id
        FROM tracking_orders o
        JOIN tracking_upsell_stages s ON s.project_id=o.project_id
        WHERE o.id=${req.params.orderId} AND s.id=${req.params.stageId}
          AND o.project_id=${p.id} AND o.order_kind='front' AND o.paid_at IS NOT NULL
      `;
      if (!eligible) return reply.code(404).send({ error: 'upsell_test_target_not_found' });
      await app.db`
        INSERT INTO tracking_upsell_manual_test_results
          (project_id,order_id,stage_id,result,checked_by,checked_at)
        VALUES(${p.id},${eligible.order_id},${eligible.stage_id},${parsed.data.result},${req.user!.sub},now())
        ON CONFLICT(order_id,stage_id) DO UPDATE SET
          result=EXCLUDED.result,checked_by=EXCLUDED.checked_by,checked_at=now()
      `;
      return { saved: true, result: parsed.data.result };
    },
  );

  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/upsell-identities/recover-failed',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
      if (!env.TRACKING_ENCRYPTION_KEY) {
        return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
      }
      const failed = await app.db<
        Array<{
          order_id: string;
          stage_id: string;
          vendid_encrypted: string;
          connection_id: string | null;
          destination_url: string;
          connection_destinations: Record<string, string> | null;
        }>
      >`
        SELECT mr.order_id,mr.stage_id,i.vendid_encrypted,
               COALESCE(i.vendepay_connection_id,o.vendepay_connection_id) AS connection_id,
               s.destination_url,s.connection_destinations
        FROM tracking_upsell_manual_test_results mr
        JOIN tracking_orders o ON o.id=mr.order_id AND o.project_id=mr.project_id
        JOIN tracking_upsell_stages s ON s.id=mr.stage_id AND s.project_id=mr.project_id
        JOIN LATERAL (
          SELECT vendid_encrypted,vendepay_connection_id
          FROM tracking_upsell_identities
          WHERE project_id=mr.project_id AND source_order_id=mr.order_id
          ORDER BY last_seen_at DESC LIMIT 1
        ) i ON true
        WHERE mr.project_id=${p.id} AND mr.result='failed'
          AND o.order_kind='front' AND o.paid_at IS NOT NULL AND s.enabled=true
        ORDER BY mr.checked_at ASC
      `;
      const summary = {
        inspected: failed.length,
        recovered: 0,
        recoverable: 0,
        already_converted: 0,
        temporary_failures: 0,
        definitive_failures: 0,
        skipped: 0,
      };
      let cursor = 0;
      const workers = Array.from({ length: Math.min(4, failed.length) }, async () => {
        while (cursor < failed.length) {
          const item = failed[cursor++];
          if (!item) break;
          let vendaId: string;
          try {
            vendaId = decryptSecret(item.vendid_encrypted, env.TRACKING_ENCRYPTION_KEY!);
          } catch {
            summary.skipped += 1;
            continue;
          }
          const destination =
            (item.connection_id && item.connection_destinations?.[item.connection_id]) ||
            item.destination_url;
          if (!destination) {
            summary.skipped += 1;
            continue;
          }
          const result = await checkUpsellCompatibilityDetailed(destination, vendaId, true);
          if (result.state === 'temporary_failure') summary.temporary_failures += 1;
          if (result.state === 'definitive_failure') summary.definitive_failures += 1;
          if (result.state === 'recoverable') summary.recoverable += 1;
          if (result.state === 'already_converted') summary.already_converted += 1;
          // API eligibility is diagnostic only. A manual result records what
          // actually rendered inside Vendepay's cross-origin iframe and must
          // never be overwritten by a server-side intent check.
          if (result.compatible) summary.recovered += 1;
        }
      });
      await Promise.all(workers);
      reply.header('cache-control', 'no-store');
      return summary;
    },
  );
}
