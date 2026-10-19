import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { decryptSecret, encryptSecret } from '../../lib/secret-box.js';
import {
  sendMetaPaymentPushcut,
  syncMetaMarketingConnection,
} from '../../services/meta-marketing.js';
import { AssignmentSchema, PaymentPushcutSchema, assertAdmin } from './connection-schema.js';

export function registerPatchMetaControlConnectionsConnectionIdPushcutRoutes(app: FastifyInstance) {
  app.patch<{ Params: { connectionId: string } }>(
    '/meta-control/connections/:connectionId/pushcut',
    async (req, reply) => {
      assertAdmin(req);
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY) {
        return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
      }
      const parsed = PaymentPushcutSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_pushcut_config' });
      const [existing] = await app.db<{ payment_pushcut_secret_encrypted: string | null }[]>`
        SELECT payment_pushcut_secret_encrypted FROM meta_marketing_connections
        WHERE id=${req.params.connectionId}
      `;
      if (!existing) return reply.code(404).send({ error: 'connection_not_found' });
      if (!parsed.data.secret && !existing.payment_pushcut_secret_encrypted) {
        return reply.code(400).send({ error: 'pushcut_secret_required' });
      }
      const encrypted = parsed.data.secret
        ? encryptSecret(parsed.data.secret, env.TRACKING_ENCRYPTION_KEY)
        : existing.payment_pushcut_secret_encrypted;
      const [config] = await app.db`
        UPDATE meta_marketing_connections
        SET payment_pushcut_secret_encrypted=${encrypted},
            payment_pushcut_notification_name=${parsed.data.notification_name},
            payment_pushcut_devices=${app.db.json(parsed.data.devices)},
            payment_pushcut_enabled=${parsed.data.enabled},updated_at=now()
        WHERE id=${req.params.connectionId}
        RETURNING id,payment_pushcut_notification_name AS notification_name,
                  payment_pushcut_devices AS devices,payment_pushcut_enabled AS enabled,
                  true AS secret_configured
      `;
      if (parsed.data.enabled) {
        await app.db`
          UPDATE meta_ad_accounts
          SET payment_alert_active=(account_status=3),updated_at=now()
          WHERE connection_id=${req.params.connectionId}
        `;
      }
      return reply.send({ config });
    },
  );

  app.post<{ Params: { connectionId: string } }>(
    '/meta-control/connections/:connectionId/pushcut/test',
    async (req, reply) => {
      assertAdmin(req);
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY) {
        return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
      }
      const [config] = await app.db<
        Array<{
          name: string;
          payment_pushcut_secret_encrypted: string | null;
          payment_pushcut_notification_name: string | null;
          payment_pushcut_devices: string[];
        }>
      >`
        SELECT name,payment_pushcut_secret_encrypted,payment_pushcut_notification_name,
               payment_pushcut_devices
        FROM meta_marketing_connections WHERE id=${req.params.connectionId}
      `;
      if (!config?.payment_pushcut_secret_encrypted || !config.payment_pushcut_notification_name) {
        return reply.code(409).send({ error: 'pushcut_not_configured' });
      }
      await sendMetaPaymentPushcut({
        secret: decryptSecret(config.payment_pushcut_secret_encrypted, env.TRACKING_ENCRYPTION_KEY),
        notificationName: config.payment_pushcut_notification_name,
        devices: Array.isArray(config.payment_pushcut_devices)
          ? config.payment_pushcut_devices
          : [],
        dashboardName: config.name,
        accountName: 'Conta de teste TMX',
        accountExternalId: 'TESTE',
        businessName: 'Business Manager de teste',
        balanceMinor: 100,
        currency: 'BRL',
        test: true,
      });
      return reply.send({ accepted: true });
    },
  );

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
      const connections = await app.db!<
        Array<{
          id: string;
          app_id: string;
          app_secret_encrypted: string;
          access_token_encrypted: string;
        }>
      >`
        SELECT id,app_id,app_secret_encrypted,access_token_encrypted
        FROM meta_marketing_connections WHERE enabled=true ORDER BY created_at DESC
      `;
      for (const connection of connections) {
        try {
          await syncMetaMarketingConnection(app, connection);
        } catch (error) {
          app.log.warn(
            { error, connectionId: connection.id },
            'scheduled Meta dashboard sync failed',
          );
        }
      }
    })().catch((error) => app.log.warn({ error }, 'scheduled Meta account sync failed'));
  }, 15 * 60_000);

  timer.unref();

  app.addHook('onClose', async () => clearInterval(timer));
}
