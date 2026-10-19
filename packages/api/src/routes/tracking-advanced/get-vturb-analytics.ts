import type { FastifyInstance } from 'fastify';
import { env } from '../../env.js';
import { decryptSecret } from '../../lib/secret-box.js';
import { saoPauloParts } from '../../services/intraday-store.js';
import { saoPauloDayRange } from '../../services/utmify-sync.js';
import { vturbAnalyticsRequest } from '../../services/vturb.js';
import type { createCnameTargetContext } from './cname-target-context.js';
import {
  type VturbComparisonGroup,
  type VturbPlayer,
  databaseUnavailable,
} from './database-unavailable.js';

export function registerGetVturbAnalyticsRoutes(
  app: FastifyInstance,
  context0: ReturnType<typeof createCnameTargetContext>,
) {
  const { cnameTarget, redirectUrl, entryUrl, upsellUrl, project } = context0;

  app.get<{
    Params: { id: string };
    Querystring: { from?: string; to?: string; player_id?: string; comparison_group_id?: string };
  }>('/offers/:id/tracking/vturb/analytics', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p || !env.TRACKING_ENCRYPTION_KEY)
      return reply.code(404).send({ error: 'vturb_not_configured' });
    const [integration] = await app.db<
      Array<{
        analytics_token_encrypted: string | null;
        player_id: string | null;
        comparison_group_id: string | null;
      }>
    >`
        SELECT analytics_token_encrypted,player_id,comparison_group_id FROM vturb_integrations WHERE project_id=${p.id}
      `;
    if (!integration?.analytics_token_encrypted)
      return reply.code(422).send({ error: 'vturb_api_token_required' });
    const token = decryptSecret(integration.analytics_token_encrypted, env.TRACKING_ENCRYPTION_KEY);
    const [players, comparisonGroups] = await Promise.all([
      vturbAnalyticsRequest<VturbPlayer[]>(token, '/players/list?timezone=America%2FSao_Paulo'),
      vturbAnalyticsRequest<VturbComparisonGroup[]>(token, '/comparison_groups/list', {}),
    ]);
    const validDate = (value: string | undefined, fallback: string) =>
      /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value! : fallback;
    const today = saoPauloParts(new Date()).date;
    const from = validDate(req.query.from, today);
    const to = validDate(req.query.to, today);
    const comparisonGroupId = req.query.comparison_group_id || integration.comparison_group_id;
    if (comparisonGroupId) {
      const comparisonGroup = comparisonGroups.find((group) => group.id === comparisonGroupId);
      if (!comparisonGroup)
        return reply.code(422).send({ error: 'vturb_comparison_group_not_found' });
      const items = comparisonGroup.player_ids.slice(0, 2).map((player_id) => ({
        player_id,
        start_date: `${from} 00:00:00`,
        end_date: `${to} 23:59:59`,
      }));
      if (!items.length) return reply.code(422).send({ error: 'vturb_comparison_group_empty' });
      const stats = await vturbAnalyticsRequest<Record<string, unknown>>(
        token,
        '/comparison_groups/stats',
        { comparison_group_id: comparisonGroup.id, items, timezone: 'America/Sao_Paulo' },
      );
      return {
        kind: 'comparison_group' as const,
        comparison_group: comparisonGroup,
        period: { from, to },
        stats,
      };
    }
    const playerId = req.query.player_id || integration.player_id;
    const player = players.find((item) => item.id === playerId);
    if (!player) return reply.code(422).send({ error: 'vturb_player_required' });
    const body = {
      player_id: player.id,
      start_date: `${from} 00:00:00`,
      end_date: `${to} 23:59:59`,
      video_duration: player.duration,
      pitch_time: player.pitch_time,
      timezone: 'America/Sao_Paulo',
    };
    const [overallRows, countries, engagement, clicks, conversions, tmxCountryConversions] =
      await Promise.all([
        vturbAnalyticsRequest<unknown[]>(token, '/sessions/stats', body),
        vturbAnalyticsRequest<unknown[]>(token, '/sessions/stats_by_field', {
          ...body,
          field: 'country',
        }),
        vturbAnalyticsRequest<Record<string, unknown>>(token, '/times/user_engagement', body),
        vturbAnalyticsRequest<unknown[]>(token, '/clicks/total_by_company_timed', body),
        vturbAnalyticsRequest<Record<string, unknown>>(token, '/conversions/stats_by_day', body),
        app.db<Array<{ country: string; total_conversions: number; total_amount_brl: number }>>`
          SELECT attribution_source->>'country' AS country,count(*)::int AS total_conversions,
            COALESCE(sum(amount_brl_minor),0)::float / 100 AS total_amount_brl
          FROM tracking_orders
          WHERE project_id=${p.id} AND status='paid' AND order_kind='front'
            AND paid_at >= ${`${from}T03:00:00.000Z`}::timestamptz
            AND paid_at < (${`${to}T03:00:00.000Z`}::timestamptz + interval '1 day')
            AND NULLIF(attribution_source->>'country','') IS NOT NULL
            AND attribution_source::text LIKE '%v3\_%' ESCAPE '\\'
          GROUP BY attribution_source->>'country'
        `,
      ]);
    return {
      player,
      period: { from, to },
      overall: Array.isArray(overallRows) ? (overallRows[0] ?? {}) : overallRows,
      countries,
      engagement,
      clicks,
      conversions,
      tmx_country_conversions: tmxCountryConversions,
    };
  });

  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/offers/:id/tracking/upsells',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return { configured: false, stages: [] };
      const today = saoPauloParts(new Date()).date;
      const fromDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.from ?? '') ? req.query.from! : today;
      const toDate = /^\d{4}-\d{2}-\d{2}$/.test(req.query.to ?? '') ? req.query.to! : fromDate;
      // Keep A/B attribution aligned with the São Paulo reporting period used by the dashboard.
      const fromInstant = new Date(saoPauloDayRange(fromDate).from);
      const toInstant = new Date(saoPauloDayRange(toDate).to);
      const stages = await app.db`
        SELECT s.id,s.stage_key,s.name,s.slug,s.destination_url,s.connection_destinations,
          s.enabled,s.created_at,s.updated_at,
          (SELECT count(DISTINCT r.visitor_id)::int FROM tracking_upsell_redirects r
           WHERE r.stage_id=s.id AND r.redirected_at >= ${fromInstant}
             AND r.redirected_at < ${toInstant}) AS redirects,
          (SELECT count(DISTINCT COALESCE(
             NULLIF(lower(trim(previous.buyer->>'email')),''),
             NULLIF(regexp_replace(previous.buyer->>'phone','\D','','g'),''),
             NULLIF(trim(previous.visitor_id),''),previous.external_id))::int
           FROM tracking_orders previous
           WHERE previous.project_id=s.project_id AND previous.paid_at IS NOT NULL
             AND previous.order_kind=CASE
               WHEN substring(s.stage_key from '[0-9]+')::int=1 THEN 'front'
               WHEN substring(s.stage_key from '[0-9]+')::int=2 THEN 'upsell'
               ELSE 'upsell_' || (substring(s.stage_key from '[0-9]+')::int - 1)::text
             END
             AND previous.paid_at >= ${fromInstant}
             AND previous.paid_at < ${toInstant}) AS eligible_buyers,
          (SELECT count(DISTINCT e.visitor_id)::int FROM tracking_events e
           WHERE e.project_id=s.project_id AND e.event_name='UpsellPageView'
             AND e.properties->>'upsell_stage_id'=s.id AND e.received_at >= ${fromInstant}
             AND e.received_at < ${toInstant}) AS page_views,
          (SELECT count(DISTINCT e.visitor_id)::int FROM tracking_events e
           WHERE e.project_id=s.project_id AND e.event_name='UpsellOfferView'
             AND e.properties->>'upsell_stage_id'=s.id AND e.received_at >= ${fromInstant}
             AND e.received_at < ${toInstant}) AS offer_views,
          (SELECT count(*)::int FROM tracking_events e
           WHERE e.project_id=s.project_id AND e.event_name='UpsellAcceptClick'
             AND e.properties->>'upsell_stage_id'=s.id AND e.received_at >= ${fromInstant}
             AND e.received_at < ${toInstant}) AS accepts,
          (SELECT count(*)::int FROM tracking_events e
           WHERE e.project_id=s.project_id AND e.event_name='UpsellDeclineClick'
             AND e.properties->>'upsell_stage_id'=s.id AND e.received_at >= ${fromInstant}
             AND e.received_at < ${toInstant}) AS declines,
          (SELECT count(*)::int FROM tracking_events e
           WHERE e.project_id=s.project_id AND e.event_name='UpsellExit'
             AND e.properties->>'upsell_stage_id'=s.id AND e.received_at >= ${fromInstant}
             AND e.received_at < ${toInstant}) AS exits,
          (SELECT count(*)::int FROM tracking_events e
           WHERE e.project_id=s.project_id AND e.event_name='UpsellPageError'
             AND e.properties->>'upsell_stage_id'=s.id AND e.received_at >= ${fromInstant}
             AND e.received_at < ${toInstant}) AS errors,
          (SELECT count(DISTINCT COALESCE(
             NULLIF(lower(trim(o.buyer->>'email')),''),
             NULLIF(regexp_replace(o.buyer->>'phone','\D','','g'),''),
             NULLIF(trim(o.visitor_id),''),o.external_id))::int FROM tracking_orders o
           WHERE o.project_id=s.project_id AND o.paid_at IS NOT NULL
             AND o.order_kind=CASE s.stage_key WHEN 'upsell_1' THEN 'upsell' ELSE s.stage_key END
             AND o.paid_at >= ${fromInstant}
             AND o.paid_at < ${toInstant}
          ) AS purchases,
          (SELECT count(*)::int FROM tracking_upsell_identities i
           WHERE i.project_id=s.project_id) AS identified_buyers
        FROM tracking_upsell_stages s
        WHERE s.project_id=${p.id}
        ORDER BY substring(s.stage_key from '[0-9]+')::int
      `;
      return {
        configured: true,
        install_code: `<script async src="${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/track/upsell/u.js?key=${p.public_key}&stage=ETAPA"></script>`,
        stages: stages.map((stage) => ({
          ...stage,
          secure_url: upsellUrl(String(stage.slug)),
          install_code: `<script async src="${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/track/upsell/u.js?key=${p.public_key}&stage=${stage.stage_key}"></script>`,
        })),
      };
    },
  );
}
