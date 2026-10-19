import type { FastifyInstance } from 'fastify';
import { env } from '../../env.js';
import { decryptSecret } from '../../lib/secret-box.js';
import { saoPauloParts } from '../../services/intraday-store.js';
import { buildSyzepayRecoveryUrl } from '../../services/syzepay-upsell.js';
import { upsellOrigin } from '../../services/upsell-origin.js';
import { saoPauloDayRange } from '../../services/utmify-sync.js';
import type { createCnameTargetContext } from './cname-target-context.js';
import { databaseUnavailable } from './database-unavailable.js';

export function registerGetUpsellIdentitiesRoutes(
  app: FastifyInstance,
  context0: ReturnType<typeof createCnameTargetContext>,
) {
  const { cnameTarget, redirectUrl, entryUrl, upsellUrl, project } = context0;

  app.get<{
    Params: { id: string };
    Querystring: { from?: string; to?: string; all?: string; limit?: string; offset?: string };
  }>('/offers/:id/tracking/upsell-identities', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p) return { items: [], total: 0, limit: 50, offset: 0 };
    if (!env.TRACKING_ENCRYPTION_KEY) {
      return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
    }
    const today = saoPauloParts(new Date()).date;
    const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from ?? '') ? req.query.from! : today;
    const toDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to ?? '') ? req.query.to! : fromDate;
    const fromInstant = new Date(saoPauloDayRange(fromDate).from);
    const toInstant = new Date(saoPauloDayRange(toDate).to);
    const allHistory = req.query.all === 'true';
    const requestedLimit = Number(req.query.limit ?? 50);
    const requestedOffset = Number(req.query.offset ?? 0);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(100, Math.max(10, Math.floor(requestedLimit)))
      : 50;
    const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.floor(requestedOffset)) : 0;
    const [approvedReceipts, stages, manualResults, totals] = await Promise.all([
      app.db<
        Array<{
          id: string;
          visitor_id: string | null;
          external_id: string;
          paid_at: Date;
          connection_id: string | null;
          connection_name: string;
          provider: string;
          syzepay_session_id: string | null;
          confirmed_vendid_encrypted: string | null;
          validation_state: string | null;
          validation_error: string | null;
          validation_attempts: number | null;
          has_upsell: boolean;
          purchased_stage_keys: string[];
        }>
      >`
          SELECT o.id,o.visitor_id,o.external_id,o.paid_at,o.provider,o.attribution_source->>'syzepay_session_id' AS syzepay_session_id,
                 o.vendepay_connection_id AS connection_id,
                 CASE WHEN o.provider='vendepay' THEN vc.name
                      WHEN o.provider='syzepay' THEN sc.name
                      ELSE gc.name END AS connection_name,
                 identity.vendid_encrypted AS confirmed_vendid_encrypted,
                 validation.state AS validation_state,
                 validation.last_error AS validation_error,
                 validation.attempts AS validation_attempts,
                 EXISTS (
                   SELECT 1 FROM tracking_orders upsell
                   WHERE upsell.project_id=o.project_id
                     AND upsell.provider=o.provider
                     AND (upsell.order_kind='upsell' OR upsell.order_kind ~ '^upsell_[2-9][0-9]*$')
                     AND upsell.paid_at IS NOT NULL
                     AND (
                       (NULLIF(lower(trim(o.buyer->>'email')),'') IS NOT NULL
                         AND lower(trim(upsell.buyer->>'email'))=lower(trim(o.buyer->>'email')))
                       OR
                       (NULLIF(regexp_replace(o.buyer->>'phone','\D','','g'),'') IS NOT NULL
                         AND regexp_replace(upsell.buyer->>'phone','\D','','g')=
                             regexp_replace(o.buyer->>'phone','\D','','g'))
                       OR
                       (o.visitor_id IS NOT NULL AND upsell.visitor_id=o.visitor_id)
                     )
                 ) AS has_upsell
                 ,ARRAY(
                   SELECT DISTINCT CASE
                     WHEN upsell.order_kind='upsell' THEN 'upsell_1'
                     ELSE upsell.order_kind
                   END
                   FROM tracking_orders upsell
                   WHERE upsell.project_id=o.project_id
                     AND upsell.provider=o.provider
                     AND (upsell.order_kind='upsell' OR upsell.order_kind ~ '^upsell_[2-9][0-9]*$')
                     AND upsell.paid_at IS NOT NULL
                     AND (
                       (NULLIF(lower(trim(o.buyer->>'email')),'') IS NOT NULL
                         AND lower(trim(upsell.buyer->>'email'))=lower(trim(o.buyer->>'email')))
                       OR
                       (NULLIF(regexp_replace(o.buyer->>'phone','\D','','g'),'') IS NOT NULL
                         AND regexp_replace(upsell.buyer->>'phone','\D','','g')=
                             regexp_replace(o.buyer->>'phone','\D','','g'))
                       OR
                       (o.visitor_id IS NOT NULL AND upsell.visitor_id=o.visitor_id)
                     )
                 ) AS purchased_stage_keys
          FROM tracking_orders o
          LEFT JOIN vendepay_connections vc ON vc.id=o.vendepay_connection_id AND o.provider='vendepay'
          LEFT JOIN syzepay_company_connections sc ON sc.id=o.syzepay_connection_id AND o.provider='syzepay'
          LEFT JOIN tracking_gateway_connections gc ON gc.id=o.gateway_connection_id AND gc.provider=o.provider
          LEFT JOIN tracking_upsell_identity_validation validation ON validation.order_id=o.id
          LEFT JOIN LATERAL (
            SELECT i.vendid_encrypted
            FROM tracking_upsell_identities i
            WHERE i.project_id=o.project_id AND i.source_order_id=o.id
            ORDER BY i.last_seen_at DESC
            LIMIT 1
          ) identity ON true
          WHERE o.project_id=${p.id} AND o.order_kind='front' AND o.paid_at IS NOT NULL
            AND (${allHistory} OR (o.paid_at >= ${fromInstant} AND o.paid_at < ${toInstant}))
          ORDER BY o.paid_at DESC,o.updated_at DESC
          LIMIT ${limit} OFFSET ${offset}
        `,
      app.db<
        Array<{
          id: string;
          stage_key: string;
          name: string;
          slug: string;
          destination_url: string;
          connection_destinations: Record<string, string> | null;
        }>
      >`
          SELECT id,stage_key,name,slug,destination_url,connection_destinations
          FROM tracking_upsell_stages
          WHERE project_id=${p.id} AND enabled=true
          ORDER BY substring(stage_key from '[0-9]+')::int
        `,
      app.db<
        Array<{
          order_id: string;
          stage_id: string;
          result: 'worked' | 'failed';
          checked_at: Date;
        }>
      >`
          SELECT order_id,stage_id,result,checked_at
          FROM tracking_upsell_manual_test_results
          WHERE project_id=${p.id}
        `,
      app.db<Array<{ total: number }>>`
          SELECT count(*)::int AS total
          FROM tracking_orders
          WHERE project_id=${p.id} AND order_kind='front' AND paid_at IS NOT NULL
            AND (${allHistory} OR (paid_at >= ${fromInstant} AND paid_at < ${toInstant}))
        `,
    ]);
    reply.header('cache-control', 'private, no-store');
    // Page-bounded audit projection: a purchase never removes opening history.
    // Select after the operator filter, so members cannot learn another user's activity.
    const lastOpenings =
      approvedReceipts.length && stages.length
        ? await app.db<
            Array<{
              order_id: string;
              stage_id: string;
              operator_id: string;
              opened_at: Date;
            }>
          >`
      SELECT DISTINCT ON (order_id,stage_id) order_id,stage_id,operator_id,opened_at
      FROM tracking_upsell_operator_attempts
      WHERE project_id=${p.id}
        AND order_id=ANY(${approvedReceipts.map((receipt) => receipt.id)}::text[])
        AND stage_id=ANY(${stages.map((stage) => stage.id)}::text[])
        AND (${req.user!.role === 'admin'} OR operator_id=${req.user!.sub})
      ORDER BY order_id,stage_id,opened_at DESC,id DESC
    `
        : [];
    const operatorNames = new Map(
      await Promise.all(
        [...new Set(lastOpenings.map((row) => row.operator_id))].map(async (id) => {
          const user = await app.userStore.maybeGetById(id);
          return [id, user?.name ?? null] as const;
        }),
      ),
    );
    const lastOpeningByOrderStage = new Map(
      lastOpenings.map((row) => [
        `${row.order_id}:${row.stage_id}`,
        {
          operator_id: row.operator_id,
          operator_name: operatorNames.get(row.operator_id) ?? null,
          opened_at: row.opened_at,
        },
      ]),
    );
    const resultByOrderStage = new Map(
      manualResults.map((result) => [`${result.order_id}:${result.stage_id}`, result] as const),
    );
    const items = approvedReceipts.map((receipt) => {
      let vendid: string | undefined;
      if (receipt.confirmed_vendid_encrypted) {
        try {
          vendid = decryptSecret(receipt.confirmed_vendid_encrypted, env.TRACKING_ENCRYPTION_KEY!);
        } catch {
          vendid = undefined;
        }
      }
      const origin = upsellOrigin(receipt.provider, receipt.connection_name);
      const vendidConfirmed = origin.vendepay_validation_applicable && Boolean(vendid);
      const displayId = vendidConfirmed ? vendid! : receipt.external_id;
      return {
        id: receipt.id,
        visitor_id: receipt.visitor_id ?? '',
        vendid: displayId,
        vendid_confirmed: vendidConfirmed,
        provider: receipt.provider,
        validation_state: !origin.vendepay_validation_applicable
          ? 'not_applicable'
          : vendidConfirmed
            ? 'confirmed'
            : (receipt.validation_state ?? 'pending'),
        validation_error: receipt.validation_error,
        validation_attempts: receipt.validation_attempts ?? 0,
        approved_at: receipt.paid_at,
        connection_name: origin.connection_name,
        has_upsell: receipt.has_upsell,
        first_seen_at: receipt.paid_at,
        last_seen_at: receipt.paid_at,
        links:
          receipt.provider === 'syzepay' && receipt.syzepay_session_id
            ? stages
                .filter((stage) => stage.connection_destinations?.['gateway:syzepay'])
                .map((stage) => ({
                  stage_id: stage.id,
                  stage_key: stage.stage_key,
                  name: stage.name,
                  gateway: 'syzepay',
                  already_purchased: receipt.purchased_stage_keys.includes(stage.stage_key),
                  last_opening: lastOpeningByOrderStage.get(`${receipt.id}:${stage.id}`) ?? null,
                  url: buildSyzepayRecoveryUrl(
                    stage.connection_destinations!['gateway:syzepay']!,
                    receipt.syzepay_session_id!,
                  ),
                  force_url: null,
                  manual_result:
                    resultByOrderStage.get(`${receipt.id}:${stage.id}`)?.result ?? null,
                  manual_checked_at:
                    resultByOrderStage.get(`${receipt.id}:${stage.id}`)?.checked_at ?? null,
                }))
            : vendidConfirmed
              ? stages.map((stage) => {
                  const validatedLink = new URL(upsellUrl(stage.slug));
                  validatedLink.searchParams.set('vendaId', displayId);
                  const manualResult = resultByOrderStage.get(`${receipt.id}:${stage.id}`);
                  return {
                    stage_id: stage.id,
                    stage_key: stage.stage_key,
                    name: stage.name,
                    already_purchased: receipt.purchased_stage_keys.includes(stage.stage_key),
                    last_opening: lastOpeningByOrderStage.get(`${receipt.id}:${stage.id}`) ?? null,
                    url: validatedLink.toString(),
                    force_url: null,
                    manual_result: manualResult?.result ?? null,
                    manual_checked_at: manualResult?.checked_at ?? null,
                  };
                })
              : [],
      };
    });
    return { items, total: totals[0]?.total ?? 0, limit, offset };
  });
}
