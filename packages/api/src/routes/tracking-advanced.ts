import { createHash } from 'node:crypto';
import { resolveCname, resolveTxt } from 'node:dns/promises';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { normalizeVendepay } from '../integrations/vendepay/normalize.js';
import {
  type RailwayDnsRecord,
  deleteRailwayDomain,
  provisionRailwayDomain,
} from '../integrations/railway/domains.js';
import { zodToProblem } from '../lib/problem.js';
import { decryptSecret, encryptSecret } from '../lib/secret-box.js';
import { canonicalTrackingHostname } from '../services/tracking-domain.js';
import { saoPauloParts } from '../services/intraday-store.js';
import { saoPauloDayRange } from '../services/utmify-sync.js';
import {
  checkUpsellCompatibility,
  checkUpsellCompatibilityDetailed,
} from '../services/upsell-compatibility.js';
import { vturbAnalyticsRequest } from '../services/vturb.js';

const databaseUnavailable = {
  error: 'tracking_database_unavailable',
  detail: 'A infraestrutura de tracking está temporariamente indisponível.',
};

const vendaIdCandidateKeys = new Set([
  'vendid',
  'vendaid',
  'venda_id',
  'checkoutid',
  'checkout_id',
  'idepotentialcheckoutid',
  'potentialcheckoutid',
]);

function collectVendaIdCandidates(payload: unknown, transactionId?: string): string[] {
  const candidates: string[] = [];
  const seen = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value !== 'string') return;
    const candidate = value.trim();
    if (!candidate || seen.has(candidate)) return;
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(candidate)) return;
    seen.add(candidate);
    candidates.push(candidate);
  };
  const walk = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item);
      return;
    }
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (vendaIdCandidateKeys.has(key.toLowerCase())) add(nested);
      walk(nested);
    }
  };
  walk(payload);
  add(transactionId);
  return candidates;
}

const DomainSchema = z.object({
  hostname: z
    .string()
    .trim()
    .toLowerCase()
    .transform((value) => value.replace(/^https?:\/\//, '').split('/')[0] ?? '')
    .pipe(z.string().min(3).max(253)),
  kind: z.enum(['source', 'tracking']).default('source'),
});
const MetaRulesSchema = z.object({
  attributed_only: z.boolean(),
  minimum_amount_minor: z.number().int().min(0),
});
const UpsellManualResultSchema = z.object({
  result: z.enum(['worked', 'failed']),
});
const GatewaySchema = z.object({
  provider: z.enum(['vendepay', 'cooud']),
  propagation_param: z.string().trim().min(1).max(32).default('src'),
});
const AbSchema = z.object({
  name: z.string().trim().min(2).max(120),
  kind: z.enum(['checkout', 'presell']),
  traffic_a: z.number().int().min(1).max(99).default(50),
  variants: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        gateway: z.string().trim().max(40).nullable().optional(),
        destination_url: z.string().url().nullable().optional(),
      }),
    )
    .length(2),
});
const AbControlSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('pause') }),
  z.object({ action: z.literal('resume') }),
  z.object({ action: z.literal('select_winner'), variant_id: z.string().min(8).max(40) }),
  z.object({
    action: z.literal('update_config'),
    name: z.string().trim().min(2).max(120),
    traffic_a: z.number().int().min(1).max(99),
    variants: z.array(z.object({
      id: z.string().min(8).max(40),
      label: z.string().trim().min(1).max(80),
      destination_url: z.string().url().max(4096),
    })).length(2),
  }),
]);
const EntryLinkSchema = z.object({
  name: z.string().trim().min(2).max(120),
  destination_url: z.string().url().max(4096),
});
const EntryLinkUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  destination_url: z.string().url().max(4096),
});
const EntryLinkAbSchema = z.object({
  name: z.string().trim().min(2).max(120),
  traffic_a: z.number().int().min(1).max(99).default(50),
  variants: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(80),
        destination_url: z.string().url().max(4096),
      }),
    )
    .length(2),
});
const VturbConfigSchema = z.object({
  enabled: z.boolean(),
  analytics_api_token: z.string().trim().min(20).max(512).optional(),
  endpoint_url: z.string().url().max(2048).optional().or(z.literal('')),
  player_id: z.string().trim().max(128).optional().nullable(),
  conversion_param: z.string().trim().regex(/^[a-zA-Z0-9_]{1,32}$/).default('vtid'),
});
const ProductKindSchema = z.object({
  product_id: z.string().trim().min(1).max(256),
  kind: z.string().regex(/^(front|upsell|upsell_[2-9][0-9]*)$/),
  label: z.string().trim().max(120).nullable().optional(),
});
const UpsellStageSchema = z.object({
  stage_key: z.string().regex(/^upsell_[1-9][0-9]*$/),
  name: z.string().trim().min(2).max(120),
  destination_url: z.string().url().max(4096),
  connection_destinations: z.record(z.string(), z.string().url().max(4096)).default({}),
});
const UpsellStageUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120),
  destination_url: z.string().url().max(4096),
  connection_destinations: z.record(z.string(), z.string().url().max(4096)).default({}),
  enabled: z.boolean().optional(),
});

function parsed<T>(schema: z.ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw zodToProblem(result.error);
  return result.data;
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const cnameTarget = new URL(env.PUBLIC_BASE_URL).hostname;
  const redirectUrl = (testId: string) =>
    `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/link/${testId}`;
  const entryUrl = (slug: string) =>
    `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/c/${slug}`;
  const upsellUrl = (slug: string) =>
    `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/u/${slug}`;
  async function project(offerId: string, userId: string, admin: boolean, manage = false) {
    if (manage) await app.offerStore.assertManager(offerId, userId, admin);
    else await app.offerStore.assertAccess(offerId, userId, admin);
    if (!app.db) return null;
    const rows = await app.db<Array<{ id: string; public_key: string }>>`
      SELECT id, public_key FROM tracking_projects WHERE offer_id = ${offerId}
    `;
    return rows[0] ?? undefined;
  }

  app.get<{ Params: { id: string } }>('/offers/:id/tracking/advanced', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p) return { configured: false };
    const [domains, gateways, vendepayConnections, rules, tests, entryLinks, vturb] =
      await Promise.all([
        app.db`SELECT id, hostname, kind, dns_target, dns_records, dns_verified_at, enabled, status,
                    last_error, last_checked_at, created_at
             FROM tracking_domains WHERE project_id=${p.id} ORDER BY created_at DESC`,
        app.db`SELECT id, provider, propagation_param, enabled, created_at
             FROM tracking_gateway_connections WHERE project_id=${p.id} ORDER BY provider`,
        app.db`SELECT id, name, propagation_param, enabled, created_at
             FROM vendepay_connections WHERE project_id=${p.id} ORDER BY created_at ASC`,
        app.db`SELECT attributed_only, minimum_amount_minor, updated_at
             FROM tracking_meta_rules WHERE project_id=${p.id}`,
        app.db`
        SELECT t.id, t.name, t.kind, t.status, t.traffic_a, t.winner_variant_id,
               t.winner_locked_at, t.deleted_at, t.created_at,
               COALESCE(json_agg(json_build_object(
                 'id', v.id, 'label', v.label, 'gateway', v.gateway,
                 'destination_url', v.destination_url, 'position', v.position
               ) ORDER BY v.position) FILTER (WHERE v.id IS NOT NULL), '[]') AS variants
        FROM tracking_ab_tests t LEFT JOIN tracking_ab_variants v ON v.test_id=t.id
        WHERE t.project_id=${p.id}
        GROUP BY t.id ORDER BY t.created_at DESC`,
        app.db`
        SELECT id, name, slug, destination_url, ab_test_id, enabled, created_at, updated_at
        FROM tracking_entry_links
        WHERE project_id=${p.id}
        ORDER BY created_at DESC`,
        app.db`SELECT enabled, endpoint_url, player_id, conversion_param,
                    (analytics_token_encrypted IS NOT NULL) AS analytics_token_configured,
                    last_validated_at,last_error,updated_at
               FROM vturb_integrations WHERE project_id=${p.id}`,
      ]);
    return {
      configured: true,
      public_key: p.public_key,
      domains,
      gateways: [
        ...gateways,
        ...vendepayConnections.map((connection) => ({
          ...connection,
          provider: 'vendepay',
          managed: true,
        })),
      ],
      meta_rules: rules[0] ?? { attributed_only: true, minimum_amount_minor: 0 },
      ab_tests: tests.map((test) => ({
        ...test,
        redirect_url: redirectUrl(String(test.id)),
      })),
      entry_links: entryLinks.map((link) => ({
        ...link,
        tracking_url: entryUrl(String(link.slug)),
      })),
      domain_setup: {
        record_type: 'CNAME',
        target: cnameTarget,
        note: 'O TMX cria automaticamente o subdomínio tmx, como tmx.suaempresa.com.',
      },
      vturb: vturb[0] ?? { enabled: false, endpoint_url: null },
    };
  });

  app.patch<{ Params: { id: string }; Body: unknown }>(
    '/offers/:id/tracking/vturb',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
      if (!env.TRACKING_ENCRYPTION_KEY)
        return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
      const value = parsed(VturbConfigSchema, req.body);
      if (value.endpoint_url) {
        const endpoint = new URL(value.endpoint_url);
        if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'tracker.vturb.com')
          return reply.code(422).send({ error: 'vturb_endpoint_invalid', detail: 'Use o webhook HTTPS gerado em tracker.vturb.com.' });
      }
      const [existing] = await app.db<Array<{ analytics_token_encrypted: string | null }>>`
        SELECT analytics_token_encrypted FROM vturb_integrations WHERE project_id=${p.id}
      `;
      if (!value.analytics_api_token && !existing?.analytics_token_encrypted)
        return reply.code(422).send({ error: 'vturb_api_token_required' });
      const encryptedToken = value.analytics_api_token
        ? encryptSecret(value.analytics_api_token, env.TRACKING_ENCRYPTION_KEY)
        : existing!.analytics_token_encrypted;
      let players: Array<{ id: string; name: string; pitch_time: number; duration: number }> = [];
      try {
        players = await vturbAnalyticsRequest(value.analytics_api_token ?? decryptSecret(encryptedToken!, env.TRACKING_ENCRYPTION_KEY), '/players/list?timezone=America%2FSao_Paulo');
      } catch (error) {
        return reply.code(422).send({ error: 'vturb_validation_failed', detail: error instanceof Error ? error.message : String(error) });
      }
      if (value.player_id && !players.some((player) => player.id === value.player_id))
        return reply.code(422).send({ error: 'vturb_player_not_found' });
      await app.db`
        INSERT INTO vturb_integrations(project_id,enabled,endpoint_url,analytics_token_encrypted,player_id,conversion_param,last_validated_at,last_error)
        VALUES(${p.id},${value.enabled},${value.endpoint_url || null},${encryptedToken},${value.player_id || null},${value.conversion_param ?? 'vtid'},now(),NULL)
        ON CONFLICT(project_id) DO UPDATE SET enabled=EXCLUDED.enabled,endpoint_url=EXCLUDED.endpoint_url,
          analytics_token_encrypted=EXCLUDED.analytics_token_encrypted,player_id=EXCLUDED.player_id,
          conversion_param=EXCLUDED.conversion_param,last_validated_at=now(),last_error=NULL,updated_at=now()
      `;
      return { ok: true, players };
    },
  );

  app.get<{ Params: { id: string } }>('/offers/:id/tracking/vturb/players', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p || !env.TRACKING_ENCRYPTION_KEY) return reply.code(404).send({ error: 'vturb_not_configured' });
    const [integration] = await app.db<Array<{ analytics_token_encrypted: string | null; player_id: string | null }>>`
      SELECT analytics_token_encrypted,player_id FROM vturb_integrations WHERE project_id=${p.id}
    `;
    if (!integration?.analytics_token_encrypted) return { players: [], selected_player_id: null };
    const token = decryptSecret(integration.analytics_token_encrypted, env.TRACKING_ENCRYPTION_KEY);
    const players = await vturbAnalyticsRequest(token, '/players/list?timezone=America%2FSao_Paulo');
    return { players, selected_player_id: integration.player_id };
  });

  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string; player_id?: string } }>(
    '/offers/:id/tracking/vturb/analytics',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p || !env.TRACKING_ENCRYPTION_KEY) return reply.code(404).send({ error: 'vturb_not_configured' });
      const [integration] = await app.db<Array<{ analytics_token_encrypted: string | null; player_id: string | null }>>`
        SELECT analytics_token_encrypted,player_id FROM vturb_integrations WHERE project_id=${p.id}
      `;
      if (!integration?.analytics_token_encrypted) return reply.code(422).send({ error: 'vturb_api_token_required' });
      const token = decryptSecret(integration.analytics_token_encrypted, env.TRACKING_ENCRYPTION_KEY);
      const players = await vturbAnalyticsRequest<Array<{ id: string; name: string; pitch_time: number; duration: number }>>(token, '/players/list?timezone=America%2FSao_Paulo');
      const playerId = req.query.player_id || integration.player_id;
      const player = players.find((item) => item.id === playerId);
      if (!player) return reply.code(422).send({ error: 'vturb_player_required' });
      const validDate = (value: string | undefined, fallback: string) => /^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value! : fallback;
      const today = saoPauloParts(new Date()).date;
      const from = validDate(req.query.from, today);
      const to = validDate(req.query.to, today);
      const body = { player_id: player.id, start_date: `${from} 00:00:00`, end_date: `${to} 23:59:59`, video_duration: player.duration, pitch_time: player.pitch_time, timezone: 'America/Sao_Paulo' };
      const [overallRows, countries, engagement, clicks, conversions] = await Promise.all([
        vturbAnalyticsRequest<unknown[]>(token, '/sessions/stats', body),
        vturbAnalyticsRequest<unknown[]>(token, '/sessions/stats_by_field', { ...body, field: 'country' }),
        vturbAnalyticsRequest<Record<string, unknown>>(token, '/times/user_engagement', body),
        vturbAnalyticsRequest<unknown[]>(token, '/clicks/total_by_company_timed', body),
        vturbAnalyticsRequest<Record<string, unknown>>(token, '/conversions/stats_by_day', body),
      ]);
      return { player, period: { from, to }, overall: Array.isArray(overallRows) ? overallRows[0] ?? {} : overallRows, countries, engagement, clicks, conversions };
    },
  );

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

  app.get<{ Params: { id: string }; Querystring: { from?: string; to?: string } }>(
    '/offers/:id/tracking/upsell-identities',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const db = app.db;
      if (!p) return { items: [] };
      if (!env.TRACKING_ENCRYPTION_KEY) {
        return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
      }
      const [approvedReceipts, stages, storedIdentities, manualResults] = await Promise.all([
        app.db<Array<{
          id: string;
          payload: unknown;
          visitor_id: string | null;
          external_id: string;
          paid_at: Date;
          connection_id: string | null;
          connection_name: string;
          confirmed_vendid_encrypted: string | null;
          has_upsell: boolean;
        }>>`
          SELECT o.id,receipt.payload,o.visitor_id,o.external_id,o.paid_at,
                 o.vendepay_connection_id AS connection_id,
                 COALESCE(vc.name,'Vendepay') AS connection_name,
                 identity.vendid_encrypted AS confirmed_vendid_encrypted,
                 EXISTS (
                   SELECT 1 FROM tracking_orders upsell
                   WHERE upsell.project_id=o.project_id
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
          FROM tracking_orders o
          LEFT JOIN vendepay_connections vc ON vc.id=o.vendepay_connection_id
          LEFT JOIN LATERAL (
            SELECT i.vendid_encrypted
            FROM tracking_upsell_identities i
            WHERE i.project_id=o.project_id AND i.source_order_id=o.id
            ORDER BY i.last_seen_at DESC
            LIMIT 1
          ) identity ON true
          LEFT JOIN LATERAL (
            SELECT wr.payload
            FROM webhook_receipts wr
            WHERE wr.order_id=o.id
            ORDER BY
              (wr.payload::text ~* '"(vendid|vendaId|venda_id)"[[:space:]]*:') DESC,
              wr.received_at DESC
            LIMIT 1
          ) receipt ON true
          WHERE o.project_id=${p.id} AND o.order_kind='front' AND o.paid_at IS NOT NULL
          ORDER BY o.paid_at DESC,o.updated_at DESC
        `,
        app.db<Array<{
          id: string;
          stage_key: string;
          name: string;
          slug: string;
          destination_url: string;
          connection_destinations: Record<string, string> | null;
        }>>`
          SELECT id,stage_key,name,slug,destination_url,connection_destinations
          FROM tracking_upsell_stages
          WHERE project_id=${p.id} AND enabled=true
          ORDER BY substring(stage_key from '[0-9]+')::int
        `,
        app.db<Array<{ vendid_hash: string }>>`
          SELECT vendid_hash FROM tracking_upsell_identities WHERE project_id=${p.id}
        `,
        app.db<Array<{ order_id: string; stage_id: string; result: 'worked' | 'failed'; checked_at: Date }>>`
          SELECT order_id,stage_id,result,checked_at
          FROM tracking_upsell_manual_test_results
          WHERE project_id=${p.id}
        `,
      ]);
      reply.header('cache-control', 'no-store');
      const confirmedHashes = new Set(storedIdentities.map((identity) => identity.vendid_hash));
      const resultByOrderStage = new Map(
        manualResults.map((result) => [`${result.order_id}:${result.stage_id}`, result] as const),
      );
      const seen = new Set<string>();
      const resolvedItems = await Promise.all(approvedReceipts.map(async (receipt) => {
          const normalized = normalizeVendepay(receipt.payload);
          const normalizedEvent = normalized.kind === 'processable' ? normalized.event : null;
          const receiptMatchesOrder =
            normalizedEvent?.status === 'paid' &&
            normalizedEvent.transactionId === receipt.external_id;
          // Prefer the explicit vendaId. Vendepay's authoritative full UUID
          // is also accepted for paid front orders; never accept the short
          // eight-character code shown in its sales table.
          let vendid: string | undefined;
          if (receipt.confirmed_vendid_encrypted) {
            try {
              vendid = decryptSecret(
                receipt.confirmed_vendid_encrypted,
                env.TRACKING_ENCRYPTION_KEY!,
              );
            } catch {
              vendid = undefined;
            }
          }
          if (!vendid && receiptMatchesOrder) {
            const candidates = collectVendaIdCandidates(receipt.payload, receipt.external_id);
            vendid = candidates.find((candidate) =>
              confirmedHashes.has(createHash('sha256').update(candidate).digest('hex')),
            ) ?? candidates[0];
          }
          // A paid front webhook is authoritative. Persist its full UUID even
          // when Vendepay's one-time intent has already been consumed or is
          // temporarily unavailable; otherwise a link that worked earlier is
          // incorrectly downgraded to "aguardando validação".
          if (vendid && receiptMatchesOrder && receipt.connection_id) {
            const hash = createHash('sha256').update(vendid).digest('hex');
            if (!confirmedHashes.has(hash)) {
              const identityVisitorId = receipt.visitor_id ?? `vendepay:${receipt.external_id}`;
              await db`
                INSERT INTO tracking_upsell_identities
                  (id,project_id,visitor_id,vendid_hash,vendid_encrypted,source_order_id,
                   vendepay_connection_id)
                VALUES(${ulid()},${p.id},${identityVisitorId},${hash},
                  ${encryptSecret(vendid, env.TRACKING_ENCRYPTION_KEY!)},${receipt.id},
                  ${receipt.connection_id})
                ON CONFLICT(project_id,vendid_hash) DO UPDATE SET
                  visitor_id=EXCLUDED.visitor_id,source_order_id=EXCLUDED.source_order_id,
                  vendepay_connection_id=EXCLUDED.vendepay_connection_id,last_seen_at=now()
              `;
              confirmedHashes.add(hash);
            }
          }
          const vendidConfirmed = Boolean(vendid);
          // Keep the approved buyer visible while clearly separating the
          // purchase identifier from a vendaId confirmed by Vendepay.
          const displayId = vendid ?? receipt.external_id;
          if (seen.has(displayId)) return [];
          seen.add(displayId);
            return [{
              id: receipt.id,
              visitor_id: receipt.visitor_id ?? '',
              vendid: displayId,
              vendid_confirmed: vendidConfirmed,
              approved_at: receipt.paid_at,
              connection_name: receipt.connection_name,
              has_upsell: receipt.has_upsell,
              first_seen_at: receipt.paid_at,
              last_seen_at: receipt.paid_at,
              links: vendidConfirmed ? stages.map((stage) => {
                const validatedLink = new URL(upsellUrl(stage.slug));
                validatedLink.searchParams.set('vendaId', displayId);
                const manualResult = resultByOrderStage.get(`${receipt.id}:${stage.id}`);
                return {
                  stage_id: stage.id,
                  stage_key: stage.stage_key,
                  name: stage.name,
                  url: validatedLink.toString(),
                  force_url: null,
                  manual_result: manualResult?.result ?? null,
                  manual_checked_at: manualResult?.checked_at ?? null,
                };
              }) : [],
            }];
        }));
      const items = resolvedItems.flat();
      items.sort(
        (left, right) =>
          new Date(right.approved_at).getTime() - new Date(left.approved_at).getTime(),
      );
      return { items };
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
      const failed = await app.db<Array<{
        order_id: string;
        stage_id: string;
        vendid_encrypted: string;
        connection_id: string | null;
        destination_url: string;
        connection_destinations: Record<string, string> | null;
      }>>`
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

  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/upsell-identities/reconcile',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
      if (!env.TRACKING_ENCRYPTION_KEY) {
        return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
      }
      const receipts = await app.db<Array<{
        payload: unknown;
        connection_id: string;
      }>>`
        SELECT r.payload,r.connection_id
        FROM webhook_receipts r
        JOIN vendepay_connections c ON c.id=r.connection_id
        WHERE c.project_id=${p.id} AND r.received_at >= now()-interval '90 days'
        ORDER BY r.received_at DESC
        LIMIT 1000
      `;
      const stages = await app.db<Array<{
        destination_url: string;
        connection_destinations: Record<string, string> | null;
      }>>`
        SELECT destination_url,connection_destinations FROM tracking_upsell_stages
        WHERE project_id=${p.id} AND enabled=true
      `;
      let found = 0;
      let stored = 0;
      let candidatesTested = 0;
      for (const receipt of receipts) {
        const normalized = normalizeVendepay(receipt.payload);
        if (normalized.kind !== 'processable') continue;
        const event = normalized.event;
        const [order] = await app.db<Array<{
          id: string;
          visitor_id: string | null;
          order_kind: string;
          buyer: Record<string, string>;
          paid_at: Date | null;
        }>>`
          SELECT id,visitor_id,order_kind,buyer,paid_at FROM tracking_orders
          WHERE project_id=${p.id} AND external_id=${event.transactionId}
          LIMIT 1
        `;
        if (
          !order?.paid_at ||
          order.order_kind !== 'front' ||
          event.status !== 'paid'
        ) continue;
        const candidates = collectVendaIdCandidates(receipt.payload, event.transactionId);
        let vendid: string | undefined;
        for (const candidate of candidates) {
          candidatesTested += 1;
          const validated = await Promise.all(
            stages.map((stage) => {
              const destination =
                stage.connection_destinations?.[receipt.connection_id] || stage.destination_url;
              return checkUpsellCompatibility(destination, candidate, true);
            }),
          );
          if (validated.some(Boolean)) {
            vendid = candidate;
            break;
          }
        }
        if (!vendid) {
          // Eligibility checks can fail transiently (timeout, rate limiting or
          // a temporary Vendepay outage). A failed refresh must never erase a
          // vendaId that was already confirmed for this approved front order.
          continue;
        }
        found += 1;
        const hash = createHash('sha256').update(vendid).digest('hex');
        const identityVisitorId = order.visitor_id ?? `vendepay:${event.transactionId}`;
        await app.db`
          DELETE FROM tracking_upsell_identities
          WHERE project_id=${p.id} AND source_order_id=${order.id} AND vendid_hash<>${hash}
        `;
        await app.db`
          INSERT INTO tracking_upsell_identities
            (id,project_id,visitor_id,vendid_hash,vendid_encrypted,source_order_id,
             vendepay_connection_id)
          VALUES(${ulid()},${p.id},${identityVisitorId},${hash},
            ${encryptSecret(vendid, env.TRACKING_ENCRYPTION_KEY)},${order.id},${receipt.connection_id})
          ON CONFLICT(project_id,vendid_hash) DO UPDATE SET
            visitor_id=EXCLUDED.visitor_id,source_order_id=EXCLUDED.source_order_id,
            vendepay_connection_id=EXCLUDED.vendepay_connection_id,last_seen_at=now()
        `;
        stored += 1;
      }
      return {
        inspected: receipts.length,
        candidates_tested: candidatesTested,
        vendid_found: found,
        identities_stored: stored,
        non_paid_removed: 0,
      };
    },
  );

  app.post<{ Params: { id: string } }>('/offers/:id/tracking/upsells', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p) return reply.code(409).send({ error: 'tracking_not_configured' });
    const body = parsed(UpsellStageSchema, req.body);
    const connectionDestinations = body.connection_destinations ?? {};
    const connectionIds = Object.keys(connectionDestinations);
    if (connectionIds.length) {
      const validConnections = await app.db<Array<{ id: string }>>`
        SELECT id FROM vendepay_connections
        WHERE project_id=${p.id} AND id IN ${app.db(connectionIds)}
      `;
      if (validConnections.length !== connectionIds.length) {
        return reply.code(400).send({ error: 'invalid_vendepay_connection' });
      }
    }
    const slug = ulid().toLowerCase();
    const [existing] = await app.db<Array<{ id: string }>>`
      SELECT id FROM tracking_upsell_stages
      WHERE project_id=${p.id} AND stage_key=${body.stage_key}
      LIMIT 1
    `;
    if (existing) {
      return reply.code(409).send({
        error: 'upsell_stage_already_exists',
        detail: 'Essa etapa já está cadastrada. Edite a etapa existente em vez de criar outra.',
      });
    }
    const [stage] = await app.db<Array<{ slug: string } & Record<string, unknown>>>`
      INSERT INTO tracking_upsell_stages
        (id,project_id,stage_key,name,slug,destination_url,connection_destinations)
      VALUES(${ulid()},${p.id},${body.stage_key},${body.name},${slug},${body.destination_url},
        ${app.db.json(connectionDestinations)})
      RETURNING id,stage_key,name,slug,destination_url,connection_destinations,
        enabled,created_at,updated_at
    `;
    if (!stage) return reply.code(500).send({ error: 'upsell_stage_not_created' });
    return reply.code(201).send({ ...stage, secure_url: upsellUrl(String(stage.slug)) });
  });

  app.patch<{ Params: { id: string; stageId: string } }>(
    '/offers/:id/tracking/upsells/:stageId',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
      const body = parsed(UpsellStageUpdateSchema, req.body);
      const connectionDestinations = body.connection_destinations ?? {};
      const connectionIds = Object.keys(connectionDestinations);
      if (connectionIds.length) {
        const validConnections = await app.db<Array<{ id: string }>>`
          SELECT id FROM vendepay_connections
          WHERE project_id=${p.id} AND id IN ${app.db(connectionIds)}
        `;
        if (validConnections.length !== connectionIds.length) {
          return reply.code(400).send({ error: 'invalid_vendepay_connection' });
        }
      }
      const [stage] = await app.db`
        UPDATE tracking_upsell_stages SET name=${body.name},destination_url=${body.destination_url},
          connection_destinations=${app.db.json(connectionDestinations)},
          enabled=COALESCE(${body.enabled ?? null},enabled),updated_at=now()
        WHERE id=${req.params.stageId} AND project_id=${p.id}
        RETURNING id,stage_key,name,slug,destination_url,connection_destinations,
          enabled,created_at,updated_at
      `;
      if (!stage) return reply.code(404).send({ error: 'upsell_stage_not_found' });
      return { ...stage, secure_url: upsellUrl(String(stage.slug)) };
    },
  );

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
          (id, project_id, name, slug, destination_url)
        VALUES (${ulid()}, ${p.id}, ${body.name}, ${slug}, ${body.destination_url})
        RETURNING id, name, slug, destination_url, enabled, created_at, updated_at
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
            updated_at = now()
        WHERE id = ${req.params.linkId} AND project_id = ${p.id}
        RETURNING id, name, slug, destination_url, ab_test_id, enabled, created_at, updated_at
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

  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/meta-purchases/reconcile',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(409).send({ error: 'tracking_not_configured' });

      const result = await app.db.begin(async (sql) => {
        const orders = await sql<Array<{ id: string; external_id: string; event_at: Date }>>`
          SELECT id, external_id, COALESCE(paid_at, occurred_at) AS event_at
          FROM tracking_orders
          WHERE project_id = ${p.id} AND status = 'paid'
          ORDER BY occurred_at ASC
        `;
        const pixels = await sql<Array<{ id: string }>>`
          SELECT id FROM meta_pixels
          WHERE project_id = ${p.id} AND enabled = true
          ORDER BY created_at ASC
        `;
        const deliveries: Array<{ id: string }> = [];
        for (const order of orders) {
          for (const pixel of pixels) {
            const rows = await sql<{ id: string }[]>`
              INSERT INTO meta_deliveries AS existing
                (id, project_id, pixel_id, order_id, event_id, event_name, event_at,
                 outgoing_event_id)
              VALUES
                (${ulid()}, ${p.id}, ${pixel.id}, ${order.id},
                 ${`vendepay:${order.external_id}:purchase`}, 'Purchase', ${order.event_at}, NULL)
              ON CONFLICT (pixel_id, event_id) DO UPDATE SET
                order_id = EXCLUDED.order_id,
                event_name = 'Purchase',
                event_at = EXCLUDED.event_at,
                state = 'pending',
                attempts = 0,
                last_error = NULL
              WHERE existing.state <> 'delivered'
              RETURNING id
            `;
            if (rows[0]) deliveries.push(rows[0]);
          }
        }
        return { orders: orders.length, pixels: pixels.length, deliveries };
      });

      await Promise.allSettled(
        result.deliveries.map(({ id }) =>
          app.metaQueue.add('send', { deliveryId: id }, { jobId: `${id}-reconcile-${Date.now()}` }),
        ),
      );
      return reply.code(202).send({
        orders_found: result.orders,
        pixels_enabled: result.pixels,
        purchases_queued: result.deliveries.length,
      });
    },
  );

  app.post<{ Params: { id: string } }>('/offers/:id/tracking/domains', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p) return reply.code(409).send({ error: 'tracking_not_configured' });
    const body = parsed(DomainSchema, req.body);
    const kind = body.kind ?? 'source';
    const hostname = kind === 'tracking' ? canonicalTrackingHostname(body.hostname) : body.hostname;
    if (!hostname) {
      return reply.code(400).send({
        error: 'invalid_tracking_domain',
        detail: 'Informe um domínio público válido, como suaempresa.com.',
      });
    }
    const provision = kind === 'tracking' ? await provisionRailwayDomain(hostname) : null;
    if (kind === 'tracking' && !provision) {
      return reply.code(503).send({
        error: 'custom_domain_provisioning_unavailable',
        detail:
          'Configure RAILWAY_PROJECT_TOKEN no serviço da API para ativar domínios first-party com SSL automático.',
      });
    }
    const records = provision?.dnsRecords ?? [];
    const target =
      records.find((record) => !record.requiredValue.includes('verify'))?.requiredValue ??
      (kind === 'tracking' ? cnameTarget : null);
    const [row] = await app.db`
      INSERT INTO tracking_domains
        (id, project_id, hostname, kind, dns_target, provider_domain_id, dns_records)
      VALUES (${ulid()}, ${p.id}, ${hostname}, ${kind},
        ${target}, ${provision?.id ?? null}, ${app.db.json(records as never)})
      ON CONFLICT (project_id, hostname) DO UPDATE SET enabled=true, kind=excluded.kind,
        dns_target=excluded.dns_target, provider_domain_id=excluded.provider_domain_id,
        dns_records=excluded.dns_records
      RETURNING id, hostname, kind, dns_target, dns_records, enabled, status, created_at`;
    return reply.code(201).send(row);
  });

  app.post<{ Params: { id: string; domainId: string } }>(
    '/offers/:id/tracking/domains/:domainId/verify',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
      const [row] = await app.db<
        Array<{
          hostname: string;
          kind: 'source' | 'tracking';
          dns_target: string | null;
          dns_records: RailwayDnsRecord[];
        }>
      >`
        SELECT hostname, kind, dns_target, dns_records FROM tracking_domains
        WHERE id=${req.params.domainId} AND project_id=${p.id}`;
      if (!row) return reply.code(404).send({ error: 'domain_not_found' });
      if (row.kind === 'tracking') {
        const checks = await Promise.all(
          row.dns_records.map(async (record) => {
            const recordName =
              record.hostlabel === '@' || record.hostlabel === row.hostname
                ? row.hostname
                : record.hostlabel.endsWith(row.hostname)
                  ? record.hostlabel
                  : `${record.hostlabel}.${row.hostname}`;
            const expected = record.requiredValue.replace(/\.$/, '').toLowerCase();
            try {
              if (expected.includes('verify')) {
                const values = (await resolveTxt(recordName)).flat();
                return values.some((value) => value.toLowerCase() === expected);
              }
              const aliases = await resolveCname(recordName);
              return aliases.some((alias) => alias.replace(/\.$/, '').toLowerCase() === expected);
            } catch {
              return false;
            }
          }),
        );
        const dnsReady = checks.length > 0 && checks.every(Boolean);
        const seen = await app.db<Array<{ ok: boolean }>>`
          SELECT EXISTS(
            SELECT 1 FROM tracking_events
            WHERE project_id=${p.id}
              AND lower(event_url) LIKE ${`%://${row.hostname}/%`}
          ) AS ok`;
        const live = dnsReady && Boolean(seen[0]?.ok);
        const status = live ? 'live' : dnsReady ? 'dns_verified' : 'pending_dns';
        const detail = live
          ? 'DNS confirmado e domínio recebendo eventos.'
          : dnsReady
            ? 'DNS confirmado. Instale o script usando este domínio e abra a página uma vez.'
            : 'Configure todos os registros CNAME e TXT exibidos pelo TMX.';
        await app.db`UPDATE tracking_domains SET status=${status},
          dns_verified_at=${dnsReady ? new Date() : null}, last_checked_at=now(),
          last_error=${live ? null : detail}
          WHERE id=${req.params.domainId}`;
        return { status, detail, dns_records: row.dns_records };
      }
      const seen = await app.db<Array<{ ok: boolean }>>`
        SELECT EXISTS(
          SELECT 1 FROM tracking_events
          WHERE project_id=${p.id}
            AND lower(event_url) LIKE ${`%://${row.hostname}/%`}
        ) AS ok`;
      const status = seen[0]?.ok ? 'live' : 'pending';
      await app.db`UPDATE tracking_domains SET status=${status}, last_checked_at=now(),
        last_error=${status === 'live' ? null : 'Aguardando o primeiro evento deste domínio.'}
        WHERE id=${req.params.domainId}`;
      return {
        status,
        detail:
          status === 'live'
            ? 'Domínio recebendo eventos.'
            : 'Instale o código e abra a página uma vez.',
      };
    },
  );

  app.delete<{ Params: { id: string; domainId: string } }>(
    '/offers/:id/tracking/domains/:domainId',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (p) {
        const domains = await app.db<Array<{ provider_domain_id: string | null }>>`
          SELECT provider_domain_id FROM tracking_domains
          WHERE id=${req.params.domainId} AND project_id=${p.id}
        `;
        if (domains[0]?.provider_domain_id) {
          await deleteRailwayDomain(domains[0].provider_domain_id);
        }
        await app.db`DELETE FROM tracking_domains WHERE id=${req.params.domainId} AND project_id=${p.id}`;
      }
      return reply.code(204).send();
    },
  );

  app.patch<{ Params: { id: string } }>('/offers/:id/tracking/meta-rules', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
    const body = parsed(MetaRulesSchema, req.body);
    const [row] = await app.db`
      INSERT INTO tracking_meta_rules(project_id, attributed_only, minimum_amount_minor)
      VALUES (${p.id}, ${body.attributed_only}, ${body.minimum_amount_minor})
      ON CONFLICT(project_id) DO UPDATE SET attributed_only=excluded.attributed_only,
        minimum_amount_minor=excluded.minimum_amount_minor, updated_at=now()
      RETURNING attributed_only, minimum_amount_minor, updated_at`;
    return row;
  });

  app.post<{ Params: { id: string } }>('/offers/:id/tracking/gateways', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
    const body = parsed(GatewaySchema, req.body);
    const [row] = await app.db`
      INSERT INTO tracking_gateway_connections(id, project_id, provider, propagation_param)
      VALUES (${ulid()}, ${p.id}, ${body.provider}, ${body.propagation_param ?? 'src'})
      ON CONFLICT(project_id, provider) DO UPDATE SET enabled=true,
        propagation_param=excluded.propagation_param
      RETURNING id, provider, propagation_param, enabled, created_at`;
    return reply.code(201).send(row);
  });

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
  }>(
    '/offers/:id/tracking/ab-tests/:testId/metrics',
    async (req, reply) => {
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
    },
  );

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
};

export default plugin;
