import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { previewGooglePurchase } from '../integrations/google-ads/contracts.js';
import {
  hasGoogleAdsScope,
  listGoogleAdsAccounts,
  refreshGoogleAccessToken,
} from '../integrations/google-ads/google-ads-api.js';
import {
  GOOGLE_DATA_SCOPE,
  beginGoogleOAuth,
  exchangeGoogleCode,
  getGoogleAuthorizedEmail,
  googleOAuthConfig,
  stateHash,
} from '../integrations/google-ads/oauth.js';
import { decryptSecret, encryptSecret } from '../lib/secret-box.js';

type Params = { id: string; destinationId: string };
const path = '/offers/:id/tracking/google-ads/destinations/:destinationId/oauth';
const OAuthStatePayloadSchema = z
  .object({
    version: z.literal(1),
    user_id: z.string().min(1),
    offer_id: z.string().min(1),
    destination_id: z.string().min(1),
    nonce: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  })
  .strict();

function signOAuthState(payload: z.infer<typeof OAuthStatePayloadSchema>, secret: string) {
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', secret).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifyOAuthState(state: string, secret: string) {
  const [encoded, signature, extra] = state.split('.');
  if (!encoded || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(encoded).digest();
  const received = Buffer.from(signature, 'base64url');
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    return (
      OAuthStatePayloadSchema.safeParse(
        JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')),
      ).data ?? null
    );
  } catch {
    return null;
  }
}

const plugin: FastifyPluginAsync = async (app) => {
  async function getDestinationConnection(offerId: string, destinationId: string, userId: string) {
    if (!app.db) return null;
    const [row] = await app.db<
      {
        id: string;
        project_id: string;
        customer_id: string;
        conversion_action_id: string;
        refresh_token_encrypted: string | null;
        granted_scope: string | null;
      }[]
    >`
      SELECT d.id, d.project_id, d.customer_id, d.conversion_action_id,
             c.refresh_token_encrypted, c.granted_scope
      FROM tracking_google_ads_destinations d
      JOIN tracking_projects p ON p.id=d.project_id
      LEFT JOIN tracking_google_ads_oauth_connections c ON c.id=d.oauth_connection_id
        AND c.user_id=${userId} AND (c.offer_id IS NULL OR c.offer_id=${offerId})
      WHERE p.offer_id=${offerId} AND d.id=${destinationId} AND d.state='draft'
    `;
    return row ?? null;
  }
  app.get<{ Params: { id: string } }>(
    '/offers/:id/tracking/google-ads/connection-status',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
      const [connections, oauthConnections] = await Promise.all([
        app.db`
      SELECT d.id AS destination_id, c.id AS connection_id, c.name AS connection_name, c.connected_at
      FROM tracking_google_ads_destinations d
      JOIN tracking_projects p ON p.id=d.project_id
      LEFT JOIN tracking_google_ads_oauth_connections c ON c.id=d.oauth_connection_id
        AND c.user_id=${req.user!.sub} AND (c.offer_id IS NULL OR c.offer_id=${req.params.id})
      WHERE p.offer_id=${req.params.id} AND d.state='draft' AND c.id IS NOT NULL
    `,
        app.db`SELECT id, name, connected_at FROM tracking_google_ads_oauth_connections
        WHERE user_id=${req.user!.sub} AND (offer_id IS NULL OR offer_id=${req.params.id})
        ORDER BY connected_at DESC`,
      ]);
      return {
        oauth_configured: Boolean(googleOAuthConfig() && env.TRACKING_ENCRYPTION_KEY),
        connections,
        oauth_connections: oauthConnections,
        delivery_enabled: false,
      };
    },
  );
  app.post<{ Params: Params }>(`${path}/start`, async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    const config = googleOAuthConfig();
    const encryptionKey = env.TRACKING_ENCRYPTION_KEY;
    if (!app.db || !config || !encryptionKey)
      return reply.code(503).send({ error: 'google_oauth_not_configured' });
    const [destination] = await app.db`
      SELECT d.id FROM tracking_google_ads_destinations d JOIN tracking_projects p ON p.id=d.project_id
      WHERE p.offer_id=${req.params.id} AND d.id=${req.params.destinationId} AND d.state='draft'
    `;
    if (!destination) return reply.code(404).send({ error: 'google_ads_destination_not_found' });
    const baseFlow = beginGoogleOAuth(config);
    const state = signOAuthState(
      {
        version: 1,
        user_id: req.user!.sub,
        offer_id: req.params.id,
        destination_id: req.params.destinationId,
        nonce: baseFlow.state,
      },
      encryptionKey,
    );
    const authorizationUrl = new URL(baseFlow.authorization_url);
    authorizationUrl.searchParams.set('state', state);
    await app.db.begin(async (sql) => {
      // Do not discard an in-flight authorization when the operator starts a
      // second window/tab. Google may return the first authorization after the
      // later start request; deleting it here made that valid callback fail
      // with `google_oauth_state_expired_or_used` (HTTP 409). Every state is
      // still bound to its user/destination and atomically consumed below.
      await sql`DELETE FROM tracking_google_ads_oauth_states WHERE expires_at < now()`;
      await sql`INSERT INTO tracking_google_ads_oauth_states(state_hash, destination_id, user_id, verifier_encrypted, expires_at)
        VALUES (${stateHash(state)}, ${destination.id}, ${req.user!.sub}, ${encryptSecret(baseFlow.verifier, encryptionKey)}, now()+interval '10 minutes')`;
    });
    reply.header('Cache-Control', 'no-store');
    return { authorization_url: authorizationUrl.toString(), state };
  });
  app.post<{ Params: Params }>(`${path}/complete`, async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    const input = z
      .object({
        code: z.string().min(1).max(4096),
        state: z
          .string()
          .max(2048)
          .regex(/^(?:[A-Za-z0-9_-]{43}|[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43})$/),
      })
      .strict()
      .safeParse(req.body);
    if (!input.success) return reply.code(422).send({ error: 'invalid_google_oauth_callback' });
    const config = googleOAuthConfig();
    const encryptionKey = env.TRACKING_ENCRYPTION_KEY;
    if (!app.db || !config || !encryptionKey)
      return reply.code(503).send({ error: 'google_oauth_not_configured' });
    const statePayload = verifyOAuthState(input.data.state, encryptionKey);
    const stateMatchesRequest =
      statePayload?.user_id === req.user!.sub &&
      statePayload.offer_id === req.params.id &&
      statePayload.destination_id === req.params.destinationId;
    // Atomic consume, bound to the signed state, authenticated manager, offer and destination.
    const [flow] = await app.db`
      DELETE FROM tracking_google_ads_oauth_states s USING tracking_google_ads_destinations d, tracking_projects p
      WHERE s.destination_id=d.id AND d.project_id=p.id AND p.offer_id=${req.params.id}
        AND d.id=${req.params.destinationId} AND d.state='draft' AND s.user_id=${req.user!.sub}
        AND s.state_hash=${stateHash(input.data.state)} AND s.expires_at>now()
      RETURNING s.verifier_encrypted
    `;
    if (!stateMatchesRequest || !flow) {
      return reply.code(409).send({
        error: 'google_oauth_state_expired_or_used',
        detail:
          'Esta autorização expirou ou já foi utilizada. Volte ao Tracking e inicie uma nova conexão Google Ads.',
      });
    }
    try {
      const tokens = await exchangeGoogleCode(
        config,
        input.data.code,
        decryptSecret(flow.verifier_encrypted, encryptionKey),
      );
      const authorizedEmail = await getGoogleAuthorizedEmail(tokens.accessToken);
      const connectionId = ulid();
      const [saved] = await app.db.begin(async (sql) => {
        const [connection] = await sql`
          INSERT INTO tracking_google_ads_oauth_connections
            (id, name, refresh_token_encrypted, granted_scope, connected_by, user_id, offer_id)
          VALUES (${connectionId}, ${authorizedEmail ? `Google · ${authorizedEmail}` : `Google conectado em ${new Date().toLocaleDateString('pt-BR')}`},
            ${encryptSecret(tokens.refreshToken, encryptionKey)}, ${tokens.scope}, ${req.user!.sub},
            ${req.user!.sub}, ${req.params.id})
          RETURNING id, name, connected_at
        `;
        const [destination] = await sql`
          UPDATE tracking_google_ads_destinations d SET oauth_connection_id=${connection!.id}, updated_at=now()
          FROM tracking_projects p
          WHERE d.project_id=p.id AND p.offer_id=${req.params.id}
            AND d.id=${req.params.destinationId} AND d.state='draft'
            AND EXISTS (
              SELECT 1 FROM tracking_google_ads_oauth_connections c
              WHERE c.id=${connection!.id} AND c.user_id=${req.user!.sub}
                AND (c.offer_id IS NULL OR c.offer_id=${req.params.id})
            )
          RETURNING d.id
        `;
        if (!destination)
          throw Object.assign(new Error('google_ads_destination_archived'), {
            code: 'TMX_ARCHIVED',
          });
        return [connection];
      });
      return {
        connected: true,
        connection: saved,
        account_validated: false,
        delivery_enabled: false,
      };
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? error.code
          : 'google_oauth_connection_failed';
      req.log.error(
        { err: error, offerId: req.params.id, destinationId: req.params.destinationId, code },
        'Google OAuth completion failed',
      );
      const detail =
        code === 'google_oauth_invalid_client'
          ? 'A credencial OAuth do servidor foi recusada pelo Google. Revise o Client Secret configurado no Railway.'
          : code === 'google_oauth_invalid_grant'
            ? 'O código de autorização expirou ou já foi usado. Volte ao TMX e conecte o Google novamente.'
            : code === 'google_oauth_missing_refresh_token'
              ? 'O Google não forneceu autorização permanente. Reconecte e aceite todas as permissões solicitadas.'
              : code === 'google_oauth_missing_permission'
                ? 'Falta uma permissão Google Ads/Data Manager. Reconecte e aceite todas as permissões solicitadas.'
                : 'Não foi possível concluir a autorização. Inicie novamente a conexão com o Google.';
      // A rejected OAuth exchange is a configuration/authorization problem,
      // not an unavailable TMX origin. Returning 502 here makes reverse
      // proxies (including Cloudflare) replace this safe, actionable message
      // with their generic "origin invalid" error page. Keep it in the 4xx
      // family so the browser can show the actual fix to the operator.
      return reply.code(422).send({ error: code, detail });
    }
  });
  app.delete<{ Params: Params }>(path, async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
    await app.db.begin(async (sql) => {
      const [d] =
        await sql`SELECT d.id FROM tracking_google_ads_destinations d JOIN tracking_projects p ON p.id=d.project_id
        WHERE p.offer_id=${req.params.id} AND d.id=${req.params.destinationId}`;
      if (!d) return;
      await sql`UPDATE tracking_google_ads_destinations SET oauth_connection_id=NULL, updated_at=now() WHERE id=${d.id}`;
      await sql`DELETE FROM tracking_google_ads_oauth_states WHERE destination_id=${d.id}`;
    });
    return reply.code(204).send();
  });
  app.post<{ Params: Params }>(`${path}/attach`, async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    const input = z
      .object({ connection_id: z.string().min(1).max(64) })
      .strict()
      .safeParse(req.body);
    if (!input.success) return reply.code(422).send({ error: 'invalid_google_oauth_connection' });
    if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
    const [connection] = await app.db`
      SELECT id FROM tracking_google_ads_oauth_connections
      WHERE id=${input.data.connection_id} AND user_id=${req.user!.sub}
        AND (offer_id IS NULL OR offer_id=${req.params.id})
    `;
    if (!connection) return reply.code(403).send({ error: 'google_oauth_connection_forbidden' });
    const [destination] = await app.db`
      UPDATE tracking_google_ads_destinations d
      SET oauth_connection_id=${input.data.connection_id}, updated_at=now()
      FROM tracking_projects p
      WHERE d.project_id=p.id AND p.offer_id=${req.params.id} AND d.id=${req.params.destinationId}
        AND d.state='draft'
        AND EXISTS (
          SELECT 1 FROM tracking_google_ads_oauth_connections c
          WHERE c.id=${input.data.connection_id} AND c.user_id=${req.user!.sub}
            AND (c.offer_id IS NULL OR c.offer_id=${req.params.id})
        )
      RETURNING d.id
    `;
    if (!destination)
      return reply.code(404).send({ error: 'google_ads_destination_or_connection_not_found' });
    return { attached: true, delivery_enabled: false };
  });

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
};
export default plugin;
