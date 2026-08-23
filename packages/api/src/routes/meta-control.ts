import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { encryptSecret } from '../lib/secret-box.js';
import { syncMetaMarketingConnection } from '../services/meta-marketing.js';

const ConnectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  app_id: z.string().trim().min(5).max(80),
  app_secret: z.string().trim().min(20).max(500),
  access_token: z.string().trim().min(40).max(4096),
});
const AssignmentSchema = z.object({ offer_id: z.string().trim().min(1).nullable() });

function assertAdmin(req: { user?: { role: string } }): void {
  if (req.user?.role !== 'admin') {
    const error = new Error('Apenas administradores podem acessar o controle de contas.') as Error & {
      statusCode?: number;
    };
    error.statusCode = 403;
    throw error;
  }
}

function accountStatusLabel(status: number): string {
  if (status === 1) return 'active';
  if (status === 2) return 'disabled';
  if (status === 3) return 'unsettled';
  if ([100, 101, 202].includes(status)) return 'closed';
  return 'attention';
}

function operationalState(status: number, activeCampaigns: number, spend30d: number): string {
  if (status === 2) return 'disabled';
  if (status === 3) return 'unsettled';
  if (status !== 1) return 'attention';
  if (activeCampaigns > 0 && spend30d > 0) return 'delivering';
  return 'idle';
}

function healthScore(status: number, activeCampaigns: number, spend30d: number): number {
  if (status === 2 || [100, 101, 202].includes(status)) return 0;
  if (status === 3) return 20;
  if (status !== 1) return 35;
  if (activeCampaigns > 0 && spend30d > 0) return 100;
  if (activeCampaigns > 0) return 72;
  return 80;
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get('/meta-control/connection', async (req, reply) => {
    assertAdmin(req);
    if (!app.db) return reply.code(503).send({ connection: null });
    const [connection] = await app.db`
      SELECT id,name,app_id,token_type,token_expires_at,enabled,last_sync_at,last_sync_error,
             created_at,updated_at
      FROM meta_marketing_connections ORDER BY created_at DESC LIMIT 1
    `;
    return reply.send({ connection: connection ?? null });
  });

  app.post('/meta-control/connection', async (req, reply) => {
    assertAdmin(req);
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY) {
      return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
    }
    const parsed = ConnectionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_connection' });
    const id = ulid();
    const [connection] = await app.db`
      INSERT INTO meta_marketing_connections
        (id,name,app_id,app_secret_encrypted,access_token_encrypted)
      VALUES
        (${id},${parsed.data.name},${parsed.data.app_id},
         ${encryptSecret(parsed.data.app_secret, env.TRACKING_ENCRYPTION_KEY)},
         ${encryptSecret(parsed.data.access_token, env.TRACKING_ENCRYPTION_KEY)})
      RETURNING id,name,app_id,enabled,last_sync_at,last_sync_error,created_at,updated_at
    `;
    try {
      const result = await syncMetaMarketingConnection(app, {
        id,
        app_id: parsed.data.app_id,
        app_secret_encrypted: encryptSecret(parsed.data.app_secret, env.TRACKING_ENCRYPTION_KEY),
        access_token_encrypted: encryptSecret(parsed.data.access_token, env.TRACKING_ENCRYPTION_KEY),
      });
      return reply.code(201).send({ connection, result });
    } catch (error) {
      return reply.code(201).send({
        connection,
        warning: error instanceof Error ? error.message : String(error),
      });
    }
  });

  app.post('/meta-control/sync', async (req, reply) => {
    assertAdmin(req);
    if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
    const [connection] = await app.db<
      Array<{
        id: string;
        app_id: string;
        app_secret_encrypted: string;
        access_token_encrypted: string;
      }>
    >`
      SELECT id,app_id,app_secret_encrypted,access_token_encrypted
      FROM meta_marketing_connections WHERE enabled=true ORDER BY created_at DESC LIMIT 1
    `;
    if (!connection) return reply.code(409).send({ error: 'meta_connection_missing' });
    return reply.send(await syncMetaMarketingConnection(app, connection));
  });

  app.get('/meta-control/dashboard', async (req, reply) => {
    assertAdmin(req);
    if (!app.db) return reply.code(503).send({ accounts: [], campaigns: [] });
    const offers = await app.offerStore.listAccessible(req.user!.sub, true);
    const offerMap = new Map(offers.map((offer) => [offer.id, offer.name]));
    const accounts = await app.db<
      Array<{
        id: string;
        external_id: string;
        name: string;
        business_id: string | null;
        business_name: string | null;
        account_status: number;
        disable_reason: number;
        currency: string;
        timezone_name: string | null;
        amount_spent_minor: string;
        balance_minor: string;
        spend_cap_minor: string;
        primary_offer_id: string | null;
        last_synced_at: string;
        spend_30d_minor: string;
        impressions_30d: string;
        reach_30d: string;
        clicks_30d: string;
        link_clicks_30d: string;
        purchases_30d: string;
        purchase_value_30d: string;
        campaigns_total: number;
        campaigns_active: number;
      }>
    >`
      SELECT a.id,a.external_id,a.name,a.business_id,a.business_name,a.account_status,
             a.disable_reason,a.currency,a.timezone_name,a.amount_spent_minor::text,
             a.balance_minor::text,a.spend_cap_minor::text,a.primary_offer_id,a.last_synced_at,
             COALESCE(s.spend_30d_minor,0)::text AS spend_30d_minor,
             COALESCE(s.impressions_30d,0)::text AS impressions_30d,
             COALESCE(s.reach_30d,0)::text AS reach_30d,
             COALESCE(s.clicks_30d,0)::text AS clicks_30d,
             COALESCE(s.link_clicks_30d,0)::text AS link_clicks_30d,
             COALESCE(s.purchases_30d,0)::text AS purchases_30d,
             COALESCE(s.purchase_value_30d,0)::text AS purchase_value_30d,
             COALESCE(s.campaigns_total,0)::int AS campaigns_total,
             COALESCE(s.campaigns_active,0)::int AS campaigns_active
      FROM meta_ad_accounts a
      LEFT JOIN LATERAL (
        SELECT * FROM meta_ad_account_snapshots x WHERE x.account_id=a.id
        ORDER BY x.snapshot_date DESC LIMIT 1
      ) s ON true
      ORDER BY a.account_status, a.business_name NULLS LAST, a.name
    `;
    const campaigns = await app.db`
      SELECT c.id,c.account_id,c.external_id,c.name,c.configured_status,c.effective_status,
             c.objective,c.offer_id,c.daily_budget_minor::text,c.lifetime_budget_minor::text
      FROM meta_ad_campaigns c ORDER BY c.updated_at DESC
    `;
    const normalized = accounts.map((account) => {
      const active = Number(account.campaigns_active);
      const spend = Number(account.spend_30d_minor);
      return {
        ...account,
        primary_offer_name: account.primary_offer_id
          ? (offerMap.get(account.primary_offer_id) ?? 'Oferta removida')
          : null,
        status_label: accountStatusLabel(account.account_status),
        operational_state: operationalState(account.account_status, active, spend),
        health_score: healthScore(account.account_status, active, spend),
      };
    });
    return reply.send({
      accounts: normalized,
      campaigns,
      offers: offers.map((offer) => ({ id: offer.id, name: offer.name })),
      synced_at: normalized[0]?.last_synced_at ?? null,
    });
  });

  app.patch<{ Params: { accountId: string } }>(
    '/meta-control/accounts/:accountId/offer',
    async (req, reply) => {
      assertAdmin(req);
      if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
      const parsed = AssignmentSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_assignment' });
      if (parsed.data.offer_id) {
        await app.offerStore.get(parsed.data.offer_id);
      }
      await app.db`
        UPDATE meta_account_offer_history SET ended_at=now()
        WHERE account_id=${req.params.accountId} AND campaign_id IS NULL AND ended_at IS NULL
      `;
      if (parsed.data.offer_id) {
        await app.db`
          INSERT INTO meta_account_offer_history
            (id,account_id,offer_id,created_by)
          VALUES (${ulid()},${req.params.accountId},${parsed.data.offer_id},${req.user!.sub})
        `;
      }
      const [account] = await app.db`
        UPDATE meta_ad_accounts SET primary_offer_id=${parsed.data.offer_id},updated_at=now()
        WHERE id=${req.params.accountId} RETURNING id,primary_offer_id
      `;
      if (!account) return reply.code(404).send({ error: 'account_not_found' });
      return reply.send({ account });
    },
  );

  app.patch<{ Params: { campaignId: string } }>(
    '/meta-control/campaigns/:campaignId/offer',
    async (req, reply) => {
      assertAdmin(req);
      if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
      const parsed = AssignmentSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_assignment' });
      if (parsed.data.offer_id) await app.offerStore.get(parsed.data.offer_id);
      const [campaign] = await app.db<{ id: string; account_id: string }[]>`
        UPDATE meta_ad_campaigns SET offer_id=${parsed.data.offer_id},updated_at=now()
        WHERE id=${req.params.campaignId} RETURNING id,account_id
      `;
      if (!campaign) return reply.code(404).send({ error: 'campaign_not_found' });
      await app.db`
        UPDATE meta_account_offer_history SET ended_at=now()
        WHERE campaign_id=${campaign.id} AND ended_at IS NULL
      `;
      if (parsed.data.offer_id) {
        await app.db`
          INSERT INTO meta_account_offer_history
            (id,account_id,campaign_id,offer_id,created_by)
          VALUES
            (${ulid()},${campaign.account_id},${campaign.id},${parsed.data.offer_id},${req.user!.sub})
        `;
      }
      return reply.send({ campaign: { id: campaign.id, offer_id: parsed.data.offer_id } });
    },
  );

  const timer = setInterval(() => {
    if (!app.db) return;
    void (async () => {
      const [connection] = await app.db!<
        Array<{
          id: string;
          app_id: string;
          app_secret_encrypted: string;
          access_token_encrypted: string;
        }>
      >`
        SELECT id,app_id,app_secret_encrypted,access_token_encrypted
        FROM meta_marketing_connections WHERE enabled=true ORDER BY created_at DESC LIMIT 1
      `;
      if (connection) await syncMetaMarketingConnection(app, connection);
    })().catch((error) => app.log.warn({ error }, 'scheduled Meta account sync failed'));
  }, 15 * 60_000);
  timer.unref();
  app.addHook('onClose', async () => clearInterval(timer));
};

export default plugin;
