import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import {
  type ListPaginationQuery,
  paginationMeta,
  parseListPagination,
} from '../../lib/pagination.js';
import { encryptSecret } from '../../lib/secret-box.js';
import {
  syncMetaMarketingConnection,
  validateMetaMarketingCredentials,
} from '../../services/meta-marketing.js';
import {
  ConnectionQuerySchema,
  ConnectionSchema,
  SyncSchema,
  accountStatusLabel,
  assertAdmin,
  healthScore,
  operationalState,
} from './connection-schema.js';

export function registerGetMetaControlConnectionsRoutes(app: FastifyInstance) {
  app.get('/meta-control/connections', async (req, reply) => {
    assertAdmin(req);
    if (!app.db) return reply.code(503).send({ connections: [] });
    const connections = await app.db`
      SELECT * FROM (
        SELECT DISTINCT ON (app_id)
               id,name,app_id,token_type,token_expires_at,enabled,last_sync_at,last_sync_error,
               created_at,updated_at
        FROM meta_marketing_connections
        ORDER BY app_id,created_at DESC
      ) latest
      ORDER BY created_at DESC
    `;
    return reply.send({ connections });
  });

  app.get<{ Querystring: { connection_id?: string } }>(
    '/meta-control/connection',
    async (req, reply) => {
      assertAdmin(req);
      if (!app.db) return reply.code(503).send({ connection: null });
      const parsed = ConnectionQuerySchema.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_connection_query' });
      const [connection] = parsed.data.connection_id
        ? await app.db`
          SELECT id,name,app_id,token_type,token_expires_at,enabled,last_sync_at,last_sync_error,
                 created_at,updated_at
          FROM meta_marketing_connections WHERE id=${parsed.data.connection_id} LIMIT 1
        `
        : await app.db`
          SELECT id,name,app_id,token_type,token_expires_at,enabled,last_sync_at,last_sync_error,
                 created_at,updated_at
          FROM meta_marketing_connections ORDER BY created_at DESC LIMIT 1
        `;
      return reply.send({ connection: connection ?? null });
    },
  );

  app.post('/meta-control/connection', async (req, reply) => {
    assertAdmin(req);
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY) {
      return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
    }
    const parsed = ConnectionSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_connection' });
    try {
      await validateMetaMarketingCredentials(parsed.data.access_token, parsed.data.app_secret);
    } catch (error) {
      return reply.code(400).send({
        title: 'A Meta recusou a conexão',
        detail: error instanceof Error ? error.message : String(error),
      });
    }
    const encryptedSecret = encryptSecret(parsed.data.app_secret, env.TRACKING_ENCRYPTION_KEY);
    const encryptedToken = encryptSecret(parsed.data.access_token, env.TRACKING_ENCRYPTION_KEY);
    const [existing] = await app.db<{ id: string }[]>`
      SELECT id FROM meta_marketing_connections
      WHERE app_id=${parsed.data.app_id}
      ORDER BY created_at DESC LIMIT 1
    `;
    const id = existing?.id ?? ulid();
    const [connection] = existing
      ? await app.db`
          UPDATE meta_marketing_connections
          SET name=${parsed.data.name},app_secret_encrypted=${encryptedSecret},
              access_token_encrypted=${encryptedToken},enabled=true,last_sync_error=NULL,updated_at=now()
          WHERE id=${id}
          RETURNING id,name,app_id,enabled,last_sync_at,last_sync_error,created_at,updated_at
        `
      : await app.db`
          INSERT INTO meta_marketing_connections
            (id,name,app_id,app_secret_encrypted,access_token_encrypted)
          VALUES
            (${id},${parsed.data.name},${parsed.data.app_id},${encryptedSecret},${encryptedToken})
          RETURNING id,name,app_id,enabled,last_sync_at,last_sync_error,created_at,updated_at
        `;
    void syncMetaMarketingConnection(app, {
      id,
      app_id: parsed.data.app_id,
      app_secret_encrypted: encryptedSecret,
      access_token_encrypted: encryptedToken,
    }).catch((error) =>
      app.log.warn({ error, connectionId: id }, 'initial Meta dashboard sync failed'),
    );
    return reply.code(existing ? 200 : 201).send({ connection, syncing: true });
  });

  app.post('/meta-control/sync', async (req, reply) => {
    assertAdmin(req);
    if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
    const parsed = SyncSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_connection' });
    const [connection] = await app.db<
      Array<{
        id: string;
        app_id: string;
        app_secret_encrypted: string;
        access_token_encrypted: string;
      }>
    >`
      SELECT id,app_id,app_secret_encrypted,access_token_encrypted
      FROM meta_marketing_connections WHERE enabled=true AND id=${parsed.data.connection_id} LIMIT 1
    `;
    if (!connection) return reply.code(409).send({ error: 'meta_connection_missing' });
    return reply.send(await syncMetaMarketingConnection(app, connection));
  });

  app.get<{ Querystring: ListPaginationQuery & { connection_id?: string } }>(
    '/meta-control/dashboard',
    async (req, reply) => {
      assertAdmin(req);
      if (!app.db) return reply.code(503).send({ accounts: [], campaigns: [] });
      const parsed = ConnectionQuerySchema.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_connection_query' });
      const page = parseListPagination(req.query);
      let connectionId = parsed.data.connection_id;
      if (!connectionId) {
        const [latest] = await app.db<{ id: string }[]>`
        SELECT id FROM meta_marketing_connections WHERE enabled=true ORDER BY created_at DESC LIMIT 1
      `;
        connectionId = latest?.id;
      }
      if (!connectionId) {
        return reply.send({
          accounts: [],
          campaigns: [],
          offers: [],
          synced_at: null,
          pagination: paginationMeta(page, false),
        });
      }
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
      WHERE a.connection_id=${connectionId}
      ORDER BY a.account_status, a.business_name NULLS LAST, a.name
      LIMIT ${page.perPage + 1} OFFSET ${page.offset}
    `;
      const campaigns = await app.db`
      SELECT c.id,c.account_id,c.external_id,c.name,c.configured_status,c.effective_status,
             c.objective,c.offer_id,c.daily_budget_minor::text,c.lifetime_budget_minor::text
      FROM meta_ad_campaigns c
      JOIN meta_ad_accounts a ON a.id=c.account_id
      WHERE a.connection_id=${connectionId}
      ORDER BY c.updated_at DESC
      LIMIT ${page.perPage + 1} OFFSET ${page.offset}
    `;
      const hasMore = accounts.length > page.perPage || campaigns.length > page.perPage;
      const normalized = accounts.slice(0, page.perPage).map((account) => {
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
        campaigns: campaigns.slice(0, page.perPage),
        offers: offers.map((offer) => ({ id: offer.id, name: offer.name })),
        synced_at: normalized[0]?.last_synced_at ?? null,
        pagination: paginationMeta(page, hasMore),
      });
    },
  );

  app.get<{ Params: { connectionId: string } }>(
    '/meta-control/connections/:connectionId/pushcut',
    async (req, reply) => {
      assertAdmin(req);
      if (!app.db) return reply.code(503).send({ config: null });
      const [config] = await app.db`
        SELECT id,payment_pushcut_notification_name AS notification_name,
               payment_pushcut_devices AS devices,payment_pushcut_enabled AS enabled,
               (payment_pushcut_secret_encrypted IS NOT NULL) AS secret_configured
        FROM meta_marketing_connections WHERE id=${req.params.connectionId}
      `;
      if (!config) return reply.code(404).send({ error: 'connection_not_found' });
      return reply.send({ config });
    },
  );
}
