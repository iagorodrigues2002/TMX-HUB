import type { FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { decryptSecret, encryptSecret } from '../lib/secret-box.js';
import { beginGoogleOAuth, exchangeGoogleCode, googleOAuthConfig, stateHash } from '../integrations/google-ads/oauth.js';

type Params = { id: string; destinationId: string };
const path = '/offers/:id/tracking/google-ads/destinations/:destinationId/oauth';
const plugin: FastifyPluginAsync = async (app) => {
  app.get<{ Params: { id: string } }>('/offers/:id/tracking/google-ads/connection-status', async (req, reply) => {
    await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
    const [connections, oauthConnections] = await Promise.all([
      app.db`
      SELECT d.id AS destination_id, c.id AS connection_id, c.name AS connection_name, c.connected_at
      FROM tracking_google_ads_destinations d
      JOIN tracking_projects p ON p.id=d.project_id
      LEFT JOIN tracking_google_ads_oauth_connections c ON c.id=d.oauth_connection_id
      WHERE p.offer_id=${req.params.id} AND d.state='draft' AND c.id IS NOT NULL
    `,
      app.db`SELECT id, name, connected_at FROM tracking_google_ads_oauth_connections ORDER BY connected_at DESC`,
    ]);
    return { oauth_configured: Boolean(googleOAuthConfig() && env.TRACKING_ENCRYPTION_KEY), connections, oauth_connections: oauthConnections, delivery_enabled: false };
  });
  app.post<{ Params: Params }>(`${path}/start`, async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    const config = googleOAuthConfig();
    if (!app.db || !config || !env.TRACKING_ENCRYPTION_KEY) return reply.code(503).send({ error: 'google_oauth_not_configured' });
    const [destination] = await app.db`
      SELECT d.id FROM tracking_google_ads_destinations d JOIN tracking_projects p ON p.id=d.project_id
      WHERE p.offer_id=${req.params.id} AND d.id=${req.params.destinationId} AND d.state='draft'
    `;
    if (!destination) return reply.code(404).send({ error: 'google_ads_destination_not_found' });
    const flow = beginGoogleOAuth(config);
    await app.db.begin(async sql => {
      await sql`DELETE FROM tracking_google_ads_oauth_states WHERE expires_at < now() OR (destination_id=${destination.id} AND user_id=${req.user!.sub})`;
      await sql`INSERT INTO tracking_google_ads_oauth_states(state_hash, destination_id, user_id, verifier_encrypted, expires_at)
        VALUES (${stateHash(flow.state)}, ${destination.id}, ${req.user!.sub}, ${encryptSecret(flow.verifier, env.TRACKING_ENCRYPTION_KEY!)}, now()+interval '10 minutes')`;
    });
    reply.header('Cache-Control', 'no-store');
    return { authorization_url: flow.authorization_url, state: flow.state };
  });
  app.post<{ Params: Params }>(`${path}/complete`, async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    const input = z.object({ code: z.string().min(1).max(4096), state: z.string().regex(/^[A-Za-z0-9_-]{43}$/) }).strict().safeParse(req.body);
    if (!input.success) return reply.code(422).send({ error: 'invalid_google_oauth_callback' });
    const config = googleOAuthConfig();
    if (!app.db || !config || !env.TRACKING_ENCRYPTION_KEY) return reply.code(503).send({ error: 'google_oauth_not_configured' });
    // Atomic consume, bound to the authenticated manager, offer and destination.
    const [flow] = await app.db`
      DELETE FROM tracking_google_ads_oauth_states s USING tracking_google_ads_destinations d, tracking_projects p
      WHERE s.destination_id=d.id AND d.project_id=p.id AND p.offer_id=${req.params.id}
        AND d.id=${req.params.destinationId} AND d.state='draft' AND s.user_id=${req.user!.sub}
        AND s.state_hash=${stateHash(input.data.state)} AND s.expires_at>now()
      RETURNING s.verifier_encrypted
    `;
    if (!flow) return reply.code(409).send({ error: 'google_oauth_state_expired_or_used' });
    try {
      const tokens = await exchangeGoogleCode(config, input.data.code, decryptSecret(flow.verifier_encrypted, env.TRACKING_ENCRYPTION_KEY));
      const connectionId = ulid();
      const [saved] = await app.db.begin(async sql => {
        const [connection] = await sql`
          INSERT INTO tracking_google_ads_oauth_connections
            (id, name, refresh_token_encrypted, granted_scope, connected_by)
          VALUES (${connectionId}, ${`Google conectado em ${new Date().toLocaleDateString('pt-BR')}`},
            ${encryptSecret(tokens.refreshToken, env.TRACKING_ENCRYPTION_KEY!)}, ${tokens.scope}, ${req.user!.sub})
          RETURNING id, name, connected_at
        `;
        const [destination] = await sql`
          UPDATE tracking_google_ads_destinations SET oauth_connection_id=${connection!.id}, updated_at=now()
          WHERE id=${req.params.destinationId} AND state='draft'
          RETURNING id
        `;
        if (!destination) throw Object.assign(new Error('google_ads_destination_archived'), { code: 'TMX_ARCHIVED' });
        return [connection];
      });
      return { connected: true, connection: saved, account_validated: false, delivery_enabled: false };
    } catch {
      return reply.code(502).send({ error: 'google_oauth_connection_failed', detail: 'Não foi possível concluir a autorização. Inicie novamente a conexão com o Google.' });
    }
  });
  app.delete<{ Params: Params }>(path, async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
    await app.db.begin(async sql => {
      const [d] = await sql`SELECT d.id FROM tracking_google_ads_destinations d JOIN tracking_projects p ON p.id=d.project_id
        WHERE p.offer_id=${req.params.id} AND d.id=${req.params.destinationId}`;
      if (!d) return;
      await sql`UPDATE tracking_google_ads_destinations SET oauth_connection_id=NULL, updated_at=now() WHERE id=${d.id}`;
      await sql`DELETE FROM tracking_google_ads_oauth_states WHERE destination_id=${d.id}`;
    });
    return reply.code(204).send();
  });
  app.post<{ Params: Params }>(`${path}/attach`, async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    const input = z.object({ connection_id: z.string().min(1).max(64) }).strict().safeParse(req.body);
    if (!input.success) return reply.code(422).send({ error: 'invalid_google_oauth_connection' });
    if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
    const [destination] = await app.db`
      UPDATE tracking_google_ads_destinations d
      SET oauth_connection_id=${input.data.connection_id}, updated_at=now()
      FROM tracking_projects p
      WHERE d.project_id=p.id AND p.offer_id=${req.params.id} AND d.id=${req.params.destinationId}
        AND d.state='draft'
        AND EXISTS (SELECT 1 FROM tracking_google_ads_oauth_connections c WHERE c.id=${input.data.connection_id})
      RETURNING d.id
    `;
    if (!destination) return reply.code(404).send({ error: 'google_ads_destination_or_connection_not_found' });
    return { attached: true, delivery_enabled: false };
  });
};
export default plugin;
