import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { previewGooglePurchase } from '../../integrations/google-ads/contracts.js';
import { refreshGoogleAccessToken } from '../../integrations/google-ads/google-ads-api.js';
import { GOOGLE_DATA_SCOPE, googleOAuthConfig } from '../../integrations/google-ads/oauth.js';
import { decryptSecret } from '../../lib/secret-box.js';
import type { createGetDestinationConnectionContext } from './get-destination-connection-context.js';
import { path, type Params } from './params.js';

export function registerPostOauthTestSyntheticRoutes(
  app: FastifyInstance,
  context0: ReturnType<typeof createGetDestinationConnectionContext>,
) {
  const { getDestinationConnection } = context0;

  /**
   * Safe configuration probe: does not need a historical order or a real
   * click. validateOnly makes Google validate the OAuth grant, destination,
   * conversion action and event shape without ingesting a conversion.
   */
  app.post<{ Params: Params }>(`${path}/test-synthetic`, async (req, reply) => {
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
    try {
      const syntheticId = `tmx-validation-${ulid()}`;
      const body = previewGooglePurchase(
        {
          projectId: destination.project_id,
          orderId: syntheticId,
          status: 'paid',
          orderKind: 'front',
          paidAt: new Date().toISOString(),
          value: 1,
          currency: 'BRL',
          // This placeholder is intentionally never sent in a live request. It
          // only satisfies the API's required identifier shape in validateOnly.
          adIdentifiers: { gclid: `TMX_VALIDATE_${ulid()}` },
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
      if (!response.ok) throw new Error('google_data_manager_synthetic_validation_failed');
      return {
        passed: true,
        validate_only: true,
        synthetic: true,
        request_id: payload?.requestId ?? null,
        warnings: payload?.fieldWarnings?.length ?? 0,
        order_id: null,
        detail:
          'Google validou a autorização, o destino, a ação e o payload sintético. Nenhuma venda ou conversão foi criada.',
      };
    } catch {
      return reply.code(422).send({
        error: 'google_data_manager_synthetic_validation_failed',
        detail:
          'O Google recusou a validação sintética. Confira a conta, a ação de conversão e as permissões da conexão.',
      });
    }
  });
}
