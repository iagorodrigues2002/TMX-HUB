import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { NotFoundError, zodToProblem } from '../../lib/problem.js';
import { decryptSecret } from '../../lib/secret-box.js';
import type { createProjectForContext } from './project-for-context.js';
import { BulkSendSchema, SendSchema, hash, renderRecoveryEmail } from './settings-schema.js';

export function registerPostRecoveryOpportunitiesOpportunityIdSendRoutes(
  app: FastifyInstance,
  context0: ReturnType<typeof createProjectForContext>,
) {
  const { projectFor, setupResendWebhook, reconcileResendDeliveries } = context0;

  app.post<{ Params: { id: string; opportunityId: string }; Body: unknown }>(
    '/offers/:id/recovery/opportunities/:opportunityId/send',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY) return reply.code(503).send();
      const parsed = SendSchema.safeParse(req.body);
      if (!parsed.success) throw zodToProblem(parsed.error);
      const project = await projectFor(req.params.id);
      const [row] = await app.db<
        Array<{
          opportunity_id: string;
          status: string;
          buyer_name: string | null;
          email: string | null;
          phone: string | null;
          recovery_token_encrypted: string;
          channel_id: string;
          credentials_encrypted: string;
          config: Record<string, string>;
        }>
      >`
      SELECT ro.id AS opportunity_id,ro.status,ro.buyer_name,ro.email,ro.phone,ro.recovery_token_encrypted,rc.id AS channel_id,rc.credentials_encrypted,rc.config
      FROM recovery_opportunities ro JOIN recovery_channels rc ON rc.project_id=ro.project_id AND rc.kind=${parsed.data.channel} AND rc.enabled=true
      WHERE ro.id=${req.params.opportunityId} AND ro.project_id=${project.id} AND ro.status IN ('eligible','contacted','clicked')`;
      if (!row) throw new NotFoundError('Oportunidade ou canal não encontrado.');
      const credentials = JSON.parse(
        decryptSecret(row.credentials_encrypted, env.TRACKING_ENCRYPTION_KEY),
      ) as Record<string, string>;
      const token = decryptSecret(row.recovery_token_encrypted, env.TRACKING_ENCRYPTION_KEY);
      const messageId = ulid();
      const clickToken = randomBytes(24).toString('base64url');
      const link = `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/recovery/r/${token}?m=${encodeURIComponent(clickToken)}`;
      const name = row.buyer_name?.split(/\s+/)[0] || 'cliente';
      if (parsed.data.channel === 'email') {
        if (!row.email) return reply.code(409).send({ error: 'email_missing' });
        const [previous] = await app.db`
          SELECT 1 FROM recovery_messages rm
          JOIN recovery_channels rc ON rc.id=rm.channel_id AND rc.kind='email'
          JOIN recovery_opportunities ro ON ro.id=rm.opportunity_id
          WHERE ro.project_id=${project.id} AND lower(trim(ro.email))=${row.email.trim().toLowerCase()}
            AND rm.state IN ('sent','delivered','read') LIMIT 1`;
        if (previous) return reply.code(409).send({ error: 'recovery_email_already_sent' });
      }
      await app.db`INSERT INTO recovery_messages(id,opportunity_id,channel_id,state,click_token_hash,content_snapshot) VALUES(${messageId},${row.opportunity_id},${row.channel_id},'pending',${hash(clickToken)},${app.db.json({ channel: parsed.data.channel, link } as never)})`;
      let response: Response;
      if (parsed.data.channel === 'whatsapp') {
        if (!row.phone) return reply.code(409).send({ error: 'phone_missing' });
        response = await fetch(
          `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${credentials.phone_number_id}/messages`,
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${credentials.access_token}`,
              'content-type': 'application/json',
            },
            body: JSON.stringify({
              messaging_product: 'whatsapp',
              to: row.phone.replace(/\D/g, ''),
              type: 'template',
              template: {
                name: row.config.template_name,
                language: { code: row.config.language || 'pt_BR' },
                components: [
                  {
                    type: 'body',
                    parameters: [
                      { type: 'text', text: name },
                      { type: 'text', text: link },
                    ],
                  },
                ],
              },
            }),
          },
        );
      } else if (parsed.data.channel === 'sms') {
        if (!row.phone) return reply.code(409).send({ error: 'phone_missing' });
        const body = new URLSearchParams({
          To: row.phone,
          From: credentials.from_number!,
          Body: (row.config.message || 'Olá {{nome}}, retome sua compra: {{link}}')
            .replaceAll('{{nome}}', name)
            .replaceAll('{{link}}', link),
        });
        response = await fetch(
          `https://api.twilio.com/2010-04-01/Accounts/${credentials.account_sid}/Messages.json`,
          {
            method: 'POST',
            headers: {
              authorization: `Basic ${Buffer.from(`${credentials.account_sid}:${credentials.auth_token}`).toString('base64')}`,
              'content-type': 'application/x-www-form-urlencoded',
            },
            body,
          },
        );
      } else {
        if (!row.email) return reply.code(409).send({ error: 'email_missing' });
        response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${credentials.api_key}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from: credentials.from_email,
            to: [row.email],
            subject: row.config.subject,
            html: renderRecoveryEmail(
              row.config.message || 'Olá {{nome}}, retome sua compra: {{link}}',
              name,
              link,
              `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/recovery/open/${clickToken}`,
            ),
          }),
        });
      }
      const result = await response.json().catch(() => ({}));
      const sent = response.ok;
      await app.db.begin(async (sql) => {
        await sql`UPDATE recovery_messages SET state=${sent ? 'sent' : 'failed'},provider_message_id=${String((result as { id?: string }).id ?? '') || null},response_status=${response.status},last_error=${sent ? null : JSON.stringify(result)},sent_at=${sent ? new Date() : null} WHERE id=${messageId}`;
        await sql`INSERT INTO recovery_message_events(id,message_id,opportunity_id,event_type,metadata) VALUES(${ulid()},${messageId},${row.opportunity_id},${sent ? 'sent' : 'failed'},${sql.json({ provider_status: response.status } as never)})`;
        if (sent)
          await sql`UPDATE recovery_opportunities SET status='contacted',first_contact_at=COALESCE(first_contact_at,now()),last_contact_at=now(),updated_at=now() WHERE id=${row.opportunity_id}`;
      });
      if (!sent)
        return reply
          .code(502)
          .send({ error: 'provider_rejected', provider_status: response.status, detail: result });
      return reply.code(202).send({ accepted: true, message_id: messageId });
    },
  );

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/offers/:id/recovery/bulk-send',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send();
      const parsed = BulkSendSchema.safeParse(req.body);
      if (!parsed.success) throw zodToProblem(parsed.error);
      const project = await projectFor(req.params.id);
      const { channel, limit } = parsed.data;
      const rows = await app.db<Array<{ id: string }>>`
      SELECT ro.id FROM recovery_opportunities ro
      WHERE ro.project_id=${project.id} AND ro.status IN ('eligible','contacted','clicked')
        AND ((${channel}='email' AND NULLIF(ro.email,'') IS NOT NULL) OR (${channel}<>'email' AND NULLIF(ro.phone,'') IS NOT NULL))
        AND NOT EXISTS (SELECT 1 FROM recovery_messages rm JOIN recovery_channels rc ON rc.id=rm.channel_id WHERE rm.opportunity_id=ro.id AND rc.kind=${channel} AND rm.state IN ('sent','delivered','read'))
        AND (${channel}<>'email' OR NOT EXISTS (
          SELECT 1 FROM recovery_messages previous
          JOIN recovery_channels previous_channel ON previous_channel.id=previous.channel_id AND previous_channel.kind='email'
          JOIN recovery_opportunities previous_opportunity ON previous_opportunity.id=previous.opportunity_id
          WHERE previous_opportunity.project_id=ro.project_id
            AND lower(trim(previous_opportunity.email))=lower(trim(ro.email))
            AND previous.state IN ('sent','delivered','read')
        ))
      ORDER BY ro.created_at ASC LIMIT ${limit}`;
      let sent = 0;
      let failed = 0;
      for (let index = 0; index < rows.length; index += 5) {
        const results = await Promise.all(
          rows.slice(index, index + 5).map((row) =>
            app.inject({
              method: 'POST',
              url: `/v1/offers/${encodeURIComponent(req.params.id)}/recovery/opportunities/${encodeURIComponent(row.id)}/send`,
              headers: { authorization: req.headers.authorization ?? '' },
              payload: { channel },
            }),
          ),
        );
        for (const result of results) {
          if (result.statusCode >= 200 && result.statusCode < 300) sent++;
          else failed++;
        }
      }
      return reply.code(202).send({ accepted: true, selected: rows.length, sent, failed });
    },
  );
}
