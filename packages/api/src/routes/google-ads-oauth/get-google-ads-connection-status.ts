import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../../env.js';
import {
  beginGoogleOAuth,
  exchangeGoogleCode,
  getGoogleAuthorizedEmail,
  googleOAuthConfig,
  stateHash,
} from '../../integrations/google-ads/oauth.js';
import { decryptSecret, encryptSecret } from '../../lib/secret-box.js';
import { path, type Params, signOAuthState, verifyOAuthState } from './params.js';

export function registerGetGoogleAdsConnectionStatusRoutes(app: FastifyInstance) {
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
}
