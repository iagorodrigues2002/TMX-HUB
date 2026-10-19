import type { FastifyInstance } from 'fastify';
import { adsCalendarDay, logicalAd } from '../../services/ads-intelligence.js';
import { type Metrics, ratios, sum } from './credentials.js';
import { groupLogicalAds } from './group-logical-ads.js';

export function registerGetAdsIntelligenceRoutes(app: FastifyInstance) {
  app.get('/ads-intelligence', async (req, reply) => {
    if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
    const owner = req.user!.sub;
    const offers = (await app.offerStore.listAll()).filter((o) => o.userId === owner);
    const [connection] =
      await app.db`SELECT dashboard_id,state,next_sync_at,last_sync_at,error,cursor_date,range_end,coverage_from,coverage_to,coverage_complete,account_failures,platform_coverage,retry_attempts,excluded_campaigns FROM ads_intelligence_connections WHERE owner_id=${owner}`;
    const rows =
      await app.db`SELECT day,physical_key,raw,currency FROM ads_intelligence_daily WHERE owner_id=${owner} ORDER BY day`;
    const mappings =
      await app.db`SELECT campaign_key,offer_id FROM ads_intelligence_mappings WHERE owner_id=${owner}`;
    const manual = new Map(mappings.map((m) => [m.campaign_key, m.offer_id]));
    const excludedCampaigns = new Set<string>(
      Array.isArray(connection?.excluded_campaigns)
        ? connection.excluded_campaigns.filter(
            (value: unknown): value is string => typeof value === 'string',
          )
        : [],
    );
    const from = connection?.coverage_from ? adsCalendarDay(connection.coverage_from) : undefined;
    const to = connection?.coverage_to ? adsCalendarDay(connection.coverage_to) : undefined;
    const failures = Array.isArray(connection?.account_failures) ? connection.account_failures : [];
    const platformCoverage = Array.isArray(connection?.platform_coverage)
      ? connection.platform_coverage
      : [];
    const failedAccount = (platform: string, account: string) =>
      !account ||
      platformCoverage.some(
        (coverage: { platform: string; state: string }) =>
          coverage.platform === platform && coverage.state === 'unavailable',
      ) ||
      failures.some(
        (failure: { platform: string; account_id?: string; from?: string; to?: string }) =>
          failure.platform === platform &&
          (!failure.account_id || failure.account_id === account) &&
          (!failure.from || !to || adsCalendarDay(failure.from) <= to) &&
          (!failure.to || !from || adsCalendarDay(failure.to) >= from),
      );
    const { pending, ads } = groupLogicalAds(
      rows,
      offers,
      excludedCampaigns,
      manual,
      from,
      to,
      failedAccount,
    );
    // IDs first; names only when offer/campaign/creative resolve uniquely.
    // Missing identifiers and unattributed upsells stay outside ad ROI rather than guessed.
    const unattributed = {
      ic: 0,
      front_sales: 0,
      upsell_sales: 0,
      revenue: 0,
      unknown_revenue_sales: 0,
    };
    if (from && to && ads.size) {
      const facts = await app.db`
        WITH resolved AS (
          SELECT o.*, CASE WHEN o.attribution_locked_at IS NOT NULL OR o.order_kind='front' OR NULLIF(o.attribution_source->>'ad_id','') IS NOT NULL OR (NULLIF(o.attribution_source->>'campaign_name','') IS NOT NULL AND NULLIF(o.attribution_source->>'ad_name','') IS NOT NULL) THEN o.attribution_source ELSE parent.source END AS source
          FROM tracking_orders o
          LEFT JOIN LATERAL (
            SELECT (array_agg(f.attribution_source))[1] AS source
            FROM tracking_orders f
            WHERE f.project_id=o.project_id AND f.provider=o.provider AND f.order_kind='front' AND f.status='paid'
              AND f.syzepay_connection_id IS NOT DISTINCT FROM o.syzepay_connection_id
              AND f.occurred_at<=o.occurred_at
              AND NULLIF(o.attribution_source->>'syzepay_session_id','') IS NOT NULL
              AND f.attribution_source->>'syzepay_session_id'=o.attribution_source->>'syzepay_session_id'
            HAVING count(*)=1
          ) parent ON o.order_kind ~ '^upsell(_[0-9]+)?$'
          WHERE o.project_id IN (SELECT id FROM tracking_projects WHERE offer_id=ANY(${offers.map((o) => o.id)}))
            AND o.occurred_at>=(${from}::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND o.occurred_at<((${to}::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
        )
        SELECT p.offer_id,to_char(o.occurred_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS day,o.source->>'ad_id' AS ad_id,
          o.source->>'campaign_id' AS campaign_id,o.source->>'utm_source' AS traffic_source,
          o.source->>'campaign_name' AS campaign_name,o.source->>'ad_name' AS ad_name,o.source->>'adset_name' AS adset_name,
          count(*) FILTER(WHERE o.order_kind='front')::int AS front_sales,
          count(*) FILTER(WHERE o.order_kind ~ '^upsell(_[0-9]+)?$')::int AS upsell_sales,
          count(*) FILTER(WHERE o.amount_brl_minor IS NULL)::int AS unknown_revenue_sales,
          sum(o.amount_brl_minor)::text AS revenue
        FROM resolved o JOIN tracking_projects p ON p.id=o.project_id
        WHERE p.offer_id=ANY(${offers.map((o) => o.id)}) AND o.status='paid' AND (o.order_kind='front' OR o.order_kind ~ '^upsell(_[0-9]+)?$')
          AND o.occurred_at>=(${from}::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AND o.occurred_at<((${to}::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
        GROUP BY p.offer_id,to_char(o.occurred_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD'),o.source->>'ad_id',o.source->>'campaign_id',o.source->>'utm_source',o.source->>'campaign_name',o.source->>'ad_name',o.source->>'adset_name'`;
      const ic = await app.db`
        WITH event_facts AS (
          SELECT p.offer_id,e.visitor_id,COALESCE(e.session_id,e.id) AS session_id,
            to_char(e.received_at AT TIME ZONE 'America/Sao_Paulo','YYYY-MM-DD') AS day,
            COALESCE(page.source,'{}'::jsonb)||e.source AS source
          FROM tracking_events e JOIN tracking_projects p ON p.id=e.project_id
          LEFT JOIN LATERAL (
            SELECT source FROM tracking_events page WHERE page.project_id=e.project_id
              AND page.visitor_id=e.visitor_id AND page.event_name='PageView'
              AND page.received_at<=e.received_at
              AND (e.session_id IS NULL OR page.session_id=e.session_id)
            ORDER BY page.received_at DESC,page.id DESC LIMIT 1
          ) page ON true
          WHERE p.offer_id=ANY(${offers.map((o) => o.id)}) AND e.event_name='InitiateCheckout'
            AND e.received_at>=(${from}::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
            AND e.received_at<((${to}::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
        ) SELECT offer_id,day,source->>'ad_id' AS ad_id,source->>'campaign_name' AS campaign_name,
          CASE WHEN count(DISTINCT NULLIF(source->>'campaign_id',''))=1 THEN min(NULLIF(source->>'campaign_id','')) END AS campaign_id,
          CASE WHEN count(DISTINCT NULLIF(source->>'utm_source',''))=1 THEN min(NULLIF(source->>'utm_source','')) END AS traffic_source,
          source->>'ad_name' AS ad_name,source->>'adset_name' AS adset_name,
          count(DISTINCT(visitor_id,session_id))::int AS ic
        FROM event_facts GROUP BY offer_id,day,source->>'ad_id',source->>'campaign_name',source->>'ad_name',source->>'adset_name'`;
      for (const fact of [...facts, ...ic]) {
        const traffic =
          typeof fact.traffic_source === 'string' ? fact.traffic_source.toLowerCase().trim() : '';
        const platform = ['fb', 'facebook', 'meta', 'ig', 'instagram'].includes(traffic)
          ? 'meta'
          : ['google', 'youtube'].includes(traffic)
            ? 'google'
            : ['tiktok', 'ttk'].includes(traffic)
              ? 'tiktok'
              : null;
        let candidates = [...ads.values()].filter(
          (a) =>
            a.offer_id === fact.offer_id &&
            fact.ad_id &&
            [...a.sources.values()].some(
              (source) =>
                source.ad_id === fact.ad_id &&
                (!platform || source.platform === platform) &&
                (!fact.campaign_id || source.campaign_id === fact.campaign_id),
            ),
        );
        if (candidates.length > 1 && !fact.campaign_id && fact.campaign_name)
          candidates = candidates.filter((a) =>
            [...a.sources.values()].some(
              (source) =>
                source.ad_id === fact.ad_id &&
                source.campaign_name === fact.campaign_name &&
                (!platform || source.platform === platform),
            ),
          );
        if (!fact.ad_id) {
          const logical = logicalAd(
            fact.ad_name ?? '',
            fact.adset_name ?? '',
            offers.find((o) => o.id === fact.offer_id)?.name ?? '',
          );
          if (logical && (fact.campaign_id || fact.campaign_name))
            candidates = [...ads.values()].filter(
              (a) =>
                a.offer_id === fact.offer_id &&
                [...a.sources.values()].some(
                  (source) =>
                    (!platform || source.platform === platform) &&
                    (fact.campaign_id
                      ? source.campaign_id === fact.campaign_id
                      : source.campaign_name === fact.campaign_name),
                ) &&
                a.logical.batch === logical.batch &&
                a.logical.ad === logical.ad &&
                a.logical.variant === logical.variant,
            );
        }
        const data = candidates.length === 1 ? candidates[0]!.data : unattributed;
        if ('ic' in fact) data.ic += Number(fact.ic);
        else {
          const unknownRevenue = Number(fact.unknown_revenue_sales ?? 0);
          if (candidates.length === 1) candidates[0]!.missingRevenue ||= unknownRevenue > 0;
          else unattributed.unknown_revenue_sales += unknownRevenue;
          data.front_sales += Number(fact.front_sales);
          data.upsell_sales += Number(fact.upsell_sales);
          data.revenue += Number(fact.revenue ?? 0) / 100;
        }
      }
    }
    const batches = new Map<
      string,
      {
        key: string;
        name: string;
        offer_id: string;
        offer_name: string;
        ads: unknown[];
        data: Metrics;
        blocked: boolean;
        missingRevenue: boolean;
      }
    >();
    for (const ad of ads.values()) {
      const key = JSON.stringify([ad.offer_id, ad.batch]);
      let batch = batches.get(key);
      if (!batch) {
        batch = {
          key,
          name: ad.batch,
          offer_id: ad.offer_id,
          offer_name: offers.find((o) => o.id === ad.offer_id)!.name,
          ads: [],
          blocked: false,
          missingRevenue: false,
          data: {
            spend: 0,
            impressions: 0,
            clicks: 0,
            video_views: 0,
            ic: 0,
            front_sales: 0,
            upsell_sales: 0,
            revenue: 0,
          },
        };
        batches.set(key, batch);
      }
      sum(batch.data, ad.data);
      batch.blocked ||= ad.blocked;
      batch.missingRevenue ||= ad.missingRevenue;
      batch.ads.push({
        key: ad.key,
        name: ad.name,
        sources: [...ad.sources.values()],
        ...ratios(ad.data),
        blocked: ad.blocked,
        missingRevenue: ad.missingRevenue,
      });
    }
    const complete =
      connection?.state === 'ready' &&
      connection?.last_sync_at &&
      connection?.coverage_complete !== false &&
      pending.size === 0 &&
      unattributed.front_sales === 0 &&
      unattributed.upsell_sales === 0 &&
      ![...ads.values()].some((ad) => ad.missingRevenue);
    const calculation = (spend: number | null, blocked: boolean, missingRevenue = false) => {
      const reason = !connection?.last_sync_at
        ? 'Importação ainda não finalizada'
        : blocked
          ? 'Conta/plataforma sem escopo confirmado ou com lacuna de custos no período'
          : missingRevenue
            ? 'Faturamento com conversão pendente'
            : spend === null
              ? 'Gasto não informado'
              : spend <= 0
                ? 'Gasto zero: divisão indisponível'
                : null;
      return {
        calculation_status: reason ? 'unavailable' : complete ? 'complete' : 'provisional',
        calculation_reason:
          reason ??
          (complete
            ? null
            : 'Receita atribuída e custos conhecidos; cobertura ou atribuição geral incompleta'),
      };
    };
    return {
      connection: connection ?? null,
      offers: offers.map((o) => ({ id: o.id, name: o.name, company_name: o.companyName ?? null })),
      pending: [...pending.values()],
      batches:
        from && to
          ? [...batches.values()].map(({ data, blocked, missingRevenue, ...batch }) => ({
              ...batch,
              ads: batch.ads.map((value) => {
                const {
                  blocked: adBlocked,
                  missingRevenue: adMissingRevenue,
                  ...ad
                } = value as ReturnType<typeof ratios> & {
                  blocked: boolean;
                  missingRevenue: boolean;
                };
                const quality = calculation(ad.spend, adBlocked, adMissingRevenue);
                return {
                  ...ad,
                  ...quality,
                  ...(quality.calculation_status === 'unavailable'
                    ? { roi: null, roas: null }
                    : {}),
                };
              }),
              totals: {
                ...ratios(data),
                ...calculation(data.spend, blocked, missingRevenue),
                ...(calculation(data.spend, blocked, missingRevenue).calculation_status ===
                'unavailable'
                  ? { roi: null, roas: null }
                  : {}),
              },
            }))
          : [],
      coverage: { from: from ?? null, to: to ?? null, complete: Boolean(complete) },
      unattributed,
      currency: 'BRL',
    };
  });
}
