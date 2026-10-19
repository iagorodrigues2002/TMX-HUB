import type { FastifyInstance } from 'fastify';
import { env } from '../../env.js';
import { previewGooglePurchase } from '../../integrations/google-ads/contracts.js';
import {
  hasGoogleAdsScope,
  listGoogleAdsAccounts,
  refreshGoogleAccessToken,
} from '../../integrations/google-ads/google-ads-api.js';
import { GOOGLE_DATA_SCOPE, googleOAuthConfig } from '../../integrations/google-ads/oauth.js';
import { decryptSecret } from '../../lib/secret-box.js';
import type { createGetDestinationConnectionContext } from './get-destination-connection-context.js';
import { path, type Params } from './params.js';

export function registerGetOauthAccountsRoutes(
  app: FastifyInstance,
  context0: ReturnType<typeof createGetDestinationConnectionContext>,
) {
  const { getDestinationConnection } = context0;

  // Discovery uses the Google Ads API only; conversion delivery remains on the
  // Data Manager API. This makes multi-account selection explicit and avoids
  // guessing an account ID from an OAuth identity.
  app.get<{ Params: Params }>(`${path}/accounts`, async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    const config = googleOAuthConfig();
    if (!app.db || !config || !env.TRACKING_ENCRYPTION_KEY)
      return reply.code(503).send({ error: 'google_oauth_not_configured' });
    const destination = await getDestinationConnection(
      req.params.id,
      req.params.destinationId,
      req.user!.sub,
    );
    if (!destination) return reply.code(404).send({ error: 'google_ads_destination_not_found' });
    if (!destination.refresh_token_encrypted || !destination.granted_scope) {
      return reply.code(409).send({
        error: 'google_ads_not_connected',
        detail: 'Conecte o Google antes de listar as contas.',
      });
    }
    if (!hasGoogleAdsScope(destination.granted_scope)) {
      return reply.code(409).send({
        error: 'google_ads_reauthorization_required',
        detail: 'Reconecte o Google para conceder a permissão de listar contas Google Ads.',
      });
    }
    try {
      const accessToken = await refreshGoogleAccessToken(
        config,
        decryptSecret(destination.refresh_token_encrypted, env.TRACKING_ENCRYPTION_KEY),
      );
      const accounts = await listGoogleAdsAccounts({ accessToken });
      return { accounts };
    } catch {
      return reply.code(502).send({
        error: 'google_ads_accounts_unavailable',
        detail:
          'Não foi possível listar as contas. Verifique o token de desenvolvedor, as permissões da conta e reconecte o Google se necessário.',
      });
    }
  });

  // Resolve an ID pasted manually in the form. The result comes from the same
  // OAuth-authorized account inventory as the account picker; no account name
  // is accepted from the browser as a source of truth.
  app.get<{ Params: Params; Querystring: { customer_id?: string } }>(
    `${path}/accounts/lookup`,
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      const customerId = req.query.customer_id?.replace(/-/g, '').trim();
      if (!customerId || !/^\d{10}$/.test(customerId))
        return reply.code(422).send({ error: 'invalid_google_ads_customer_id' });
      const config = googleOAuthConfig();
      if (!app.db || !config || !env.TRACKING_ENCRYPTION_KEY)
        return reply.code(503).send({ error: 'google_oauth_not_configured' });
      const destination = await getDestinationConnection(
        req.params.id,
        req.params.destinationId,
        req.user!.sub,
      );
      if (
        !destination?.refresh_token_encrypted ||
        !destination.granted_scope ||
        !hasGoogleAdsScope(destination.granted_scope)
      ) {
        return reply.code(409).send({
          error: 'google_ads_not_connected',
          detail: 'Conecte o Google antes de buscar uma conta.',
        });
      }
      try {
        const accessToken = await refreshGoogleAccessToken(
          config,
          decryptSecret(destination.refresh_token_encrypted, env.TRACKING_ENCRYPTION_KEY),
        );
        const account = (await listGoogleAdsAccounts({ accessToken })).find(
          (item) => item.customer_id === customerId,
        );
        if (!account)
          return reply.code(404).send({
            error: 'google_ads_account_not_accessible',
            detail:
              'Esta conta não está entre as contas acessíveis pela autorização Google conectada.',
          });
        return { account };
      } catch {
        return reply.code(502).send({
          error: 'google_ads_account_lookup_failed',
          detail: 'Não foi possível consultar o ID da conta no Google Ads.',
        });
      }
    },
  );

  /** Validates OAuth, destination and a real captured Google click without sending a conversion. */
  app.post<{ Params: Params }>(`${path}/test`, async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    const config = googleOAuthConfig();
    if (!app.db || !config || !env.TRACKING_ENCRYPTION_KEY)
      return reply.code(503).send({ error: 'google_oauth_not_configured' });
    const destination = await getDestinationConnection(
      req.params.id,
      req.params.destinationId,
      req.user!.sub,
    );
    if (!destination) return reply.code(404).send({ error: 'google_ads_destination_not_found' });
    if (!destination.refresh_token_encrypted || !destination.granted_scope) {
      return reply.code(409).send({
        error: 'google_ads_not_connected',
        detail: 'Conecte o Google antes de executar o teste.',
      });
    }
    if (!destination.granted_scope.split(' ').includes(GOOGLE_DATA_SCOPE)) {
      return reply.code(409).send({
        error: 'google_ads_reauthorization_required',
        detail: 'Reconecte o Google para conceder a permissão de enviar e validar conversões.',
      });
    }
    const [order] = await app.db<
      {
        id: string;
        paid_at: string;
        amount_minor: string | number;
        currency: string;
        gclid: string | null;
        gbraid: string | null;
        wbraid: string | null;
      }[]
    >`
      SELECT id, paid_at, amount_minor, currency,
             NULLIF(attribution_source->>'gclid','') AS gclid,
             NULLIF(attribution_source->>'gbraid','') AS gbraid,
             NULLIF(attribution_source->>'wbraid','') AS wbraid
      FROM tracking_orders
      WHERE project_id=${destination.project_id} AND status='paid' AND order_kind='front'
        AND paid_at IS NOT NULL AND amount_minor IS NOT NULL AND currency IS NOT NULL
        AND (NULLIF(attribution_source->>'gclid','') IS NOT NULL
          OR NULLIF(attribution_source->>'gbraid','') IS NOT NULL
          OR NULLIF(attribution_source->>'wbraid','') IS NOT NULL)
      ORDER BY paid_at DESC LIMIT 1
    `;
    if (!order) {
      return reply.code(422).send({
        error: 'google_ads_test_requires_eligible_purchase',
        detail:
          'Ainda não existe uma venda front aprovada com GCLID/GBRAID/WBRAID nesta oferta para validar o caminho completo.',
      });
    }
    try {
      const body = previewGooglePurchase(
        {
          projectId: destination.project_id,
          orderId: order.id,
          status: 'paid',
          orderKind: 'front',
          paidAt: new Date(order.paid_at).toISOString(),
          value: Number(order.amount_minor) / 100,
          currency: order.currency,
          adIdentifiers: {
            gclid: order.gclid ?? undefined,
            gbraid: order.gbraid ?? undefined,
            wbraid: order.wbraid ?? undefined,
          },
        },
        destination.customer_id,
        destination.conversion_action_id,
      );
      const accessToken = await refreshGoogleAccessToken(
        config,
        decryptSecret(destination.refresh_token_encrypted, env.TRACKING_ENCRYPTION_KEY),
      );
      const response = await fetch('https://datamanager.googleapis.com/v1/events:ingest', {
        method: 'POST',
        headers: { authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      const payload = (await response.json().catch(() => null)) as {
        requestId?: string;
        fieldWarnings?: unknown[];
      } | null;
      if (!response.ok) throw new Error('google_data_manager_validation_failed');
      return {
        passed: true,
        validate_only: true,
        request_id: payload?.requestId ?? null,
        warnings: payload?.fieldWarnings?.length ?? 0,
        order_id: order.id,
        detail:
          'Google validou a autorização, o destino, a ação e o payload. Nenhuma conversão foi enviada neste teste.',
      };
    } catch {
      return reply.code(422).send({
        error: 'google_data_manager_validation_failed',
        detail:
          'O Google recusou a validação. Confira a conta, a ação de conversão e as permissões da conexão.',
      });
    }
  });
}
