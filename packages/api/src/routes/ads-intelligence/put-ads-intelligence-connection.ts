import type { FastifyInstance } from 'fastify';
import { env } from '../../env.js';
import { encryptSecret } from '../../lib/secret-box.js';
import { credentials, mapping } from './credentials.js';

export function registerPutAdsIntelligenceConnectionRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    if (req.user?.role !== 'admin')
      throw Object.assign(new Error('Acesso administrativo necessário.'), { statusCode: 403 });
  });

  app.put('/ads-intelligence/connection', async (req, reply) => {
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY)
      return reply.code(503).send({ error: 'database_unavailable' });
    const parsed = credentials.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_connection' });
    const encrypted = encryptSecret(
      JSON.stringify({ login: parsed.data.login, password: parsed.data.password }),
      env.TRACKING_ENCRYPTION_KEY,
    );
    await app.db.begin(async (sql) => {
      const [existing] =
        await sql`SELECT dashboard_id,state FROM ads_intelligence_connections WHERE owner_id=${req.user!.sub} FOR UPDATE`;
      if (existing?.state === 'importing')
        throw Object.assign(new Error('Importação em andamento.'), { statusCode: 409 });
      if (existing && existing.dashboard_id !== parsed.data.dashboard_id) {
        await sql`DELETE FROM ads_intelligence_daily WHERE owner_id=${req.user!.sub}`;
        await sql`DELETE FROM ads_intelligence_mappings WHERE owner_id=${req.user!.sub}`;
        await sql`DELETE FROM ads_intelligence_connections WHERE owner_id=${req.user!.sub}`;
      }
      await sql`INSERT INTO ads_intelligence_connections(owner_id,dashboard_id,credentials_encrypted) VALUES(${req.user!.sub},${parsed.data.dashboard_id},${encrypted}) ON CONFLICT(owner_id) DO UPDATE SET credentials_encrypted=EXCLUDED.credentials_encrypted,state='ready',error=NULL,next_sync_at=CASE WHEN ads_intelligence_connections.last_sync_at IS NULL THEN now() ELSE GREATEST(ads_intelligence_connections.next_sync_at,ads_intelligence_connections.last_sync_at+interval '7 days') END`;
    });
    return { saved: true };
  });

  app.put('/ads-intelligence/mappings', async (req, reply) => {
    if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
    const parsed = mapping.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_mapping' });
    const offer = await app.offerStore.get(parsed.data.offer_id);
    if (offer.userId !== req.user!.sub)
      return reply.code(403).send({ error: 'offer_owner_mismatch' });
    await app.db`INSERT INTO ads_intelligence_mappings(owner_id,campaign_key,offer_id) VALUES(${req.user!.sub},${parsed.data.campaign_key},${offer.id}) ON CONFLICT(owner_id,campaign_key) DO UPDATE SET offer_id=EXCLUDED.offer_id`;
    return { saved: true };
  });
}
