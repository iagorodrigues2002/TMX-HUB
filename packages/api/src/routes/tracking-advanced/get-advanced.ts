import type { FastifyInstance } from 'fastify';
import { env } from '../../env.js';
import { decryptSecret, encryptSecret } from '../../lib/secret-box.js';
import { vturbAnalyticsRequest } from '../../services/vturb.js';
import type { createCnameTargetContext } from './cname-target-context.js';
import {
  type VturbComparisonGroup,
  VturbConfigSchema,
  type VturbPlayer,
  databaseUnavailable,
  mergeAdvancedGateways,
  parsed,
} from './database-unavailable.js';

export function registerGetAdvancedRoutes(
  app: FastifyInstance,
  context0: ReturnType<typeof createCnameTargetContext>,
) {
  const { cnameTarget, redirectUrl, entryUrl, upsellUrl, project } = context0;

  app.get<{ Params: { id: string } }>('/offers/:id/tracking/advanced', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p) return { configured: false };
    const [domains, gateways, vendepayConnections, rules, tests, entryLinks, vturb] =
      await Promise.all([
        app.db`SELECT id, hostname, kind, dns_target, dns_records, dns_verified_at, enabled, status,
                    last_error, last_checked_at, created_at
             FROM tracking_domains WHERE project_id=${p.id} ORDER BY created_at DESC`,
        app.db`SELECT id, provider, name, propagation_param, enabled, settings, last_webhook_at, created_at
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
        SELECT id, name, slug, destination_url, traffic_source, ab_test_id, enabled, created_at, updated_at
        FROM tracking_entry_links
        WHERE project_id=${p.id}
        ORDER BY created_at DESC`,
        app.db`SELECT enabled, endpoint_url, player_id, comparison_group_id, conversion_param,
                    (analytics_token_encrypted IS NOT NULL) AS analytics_token_configured,
                    last_validated_at,last_error,updated_at
               FROM vturb_integrations WHERE project_id=${p.id}`,
      ]);
    return {
      configured: true,
      public_key: p.public_key,
      domains,
      gateways: mergeAdvancedGateways(gateways, vendepayConnections),
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
          return reply.code(422).send({
            error: 'vturb_endpoint_invalid',
            detail: 'Use o webhook HTTPS gerado em tracker.vturb.com.',
          });
      }
      const [existing] = await app.db<Array<{ analytics_token_encrypted: string | null }>>`
        SELECT analytics_token_encrypted FROM vturb_integrations WHERE project_id=${p.id}
      `;
      if (!value.analytics_api_token && !existing?.analytics_token_encrypted)
        return reply.code(422).send({ error: 'vturb_api_token_required' });
      const encryptedToken = value.analytics_api_token
        ? encryptSecret(value.analytics_api_token, env.TRACKING_ENCRYPTION_KEY)
        : existing!.analytics_token_encrypted;
      let players: VturbPlayer[] = [];
      let comparisonGroups: VturbComparisonGroup[] = [];
      try {
        const token =
          value.analytics_api_token ?? decryptSecret(encryptedToken!, env.TRACKING_ENCRYPTION_KEY);
        [players, comparisonGroups] = await Promise.all([
          vturbAnalyticsRequest<VturbPlayer[]>(token, '/players/list?timezone=America%2FSao_Paulo'),
          vturbAnalyticsRequest<VturbComparisonGroup[]>(token, '/comparison_groups/list', {}),
        ]);
      } catch (error) {
        return reply.code(422).send({
          error: 'vturb_validation_failed',
          detail: error instanceof Error ? error.message : String(error),
        });
      }
      if (value.player_id && !players.some((player) => player.id === value.player_id))
        return reply.code(422).send({ error: 'vturb_player_not_found' });
      if (
        value.comparison_group_id &&
        !comparisonGroups.some((group) => group.id === value.comparison_group_id)
      )
        return reply.code(422).send({ error: 'vturb_comparison_group_not_found' });
      await app.db`
        INSERT INTO vturb_integrations(project_id,enabled,endpoint_url,analytics_token_encrypted,player_id,comparison_group_id,conversion_param,last_validated_at,last_error)
        VALUES(${p.id},${value.enabled},${value.endpoint_url || null},${encryptedToken},${value.player_id || null},${value.comparison_group_id || null},${value.conversion_param ?? 'vtid'},now(),NULL)
        ON CONFLICT(project_id) DO UPDATE SET enabled=EXCLUDED.enabled,endpoint_url=EXCLUDED.endpoint_url,
          analytics_token_encrypted=EXCLUDED.analytics_token_encrypted,player_id=EXCLUDED.player_id,comparison_group_id=EXCLUDED.comparison_group_id,
          conversion_param=EXCLUDED.conversion_param,last_validated_at=now(),last_error=NULL,updated_at=now()
      `;
      return { ok: true, players, comparison_groups: comparisonGroups };
    },
  );

  app.get<{ Params: { id: string } }>('/offers/:id/tracking/vturb/players', async (req, reply) => {
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
      return {
        players: [],
        comparison_groups: [],
        selected_player_id: null,
        selected_comparison_group_id: null,
      };
    const token = decryptSecret(integration.analytics_token_encrypted, env.TRACKING_ENCRYPTION_KEY);
    const [players, comparisonGroups] = await Promise.all([
      vturbAnalyticsRequest<VturbPlayer[]>(token, '/players/list?timezone=America%2FSao_Paulo'),
      vturbAnalyticsRequest<VturbComparisonGroup[]>(token, '/comparison_groups/list', {}),
    ]);
    return {
      players,
      comparison_groups: comparisonGroups,
      selected_player_id: integration.player_id,
      selected_comparison_group_id: integration.comparison_group_id,
    };
  });
}
