import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { NotFoundError, zodToProblem } from '../lib/problem.js';
import { decryptSecret, encryptSecret } from '../lib/secret-box.js';

const SettingsSchema = z.object({
  checkout_url: z.string().url().max(4096).optional().or(z.literal('')),
  sender_name: z.string().trim().min(2).max(80).default('TMX'),
  quiet_start: z.coerce.number().int().min(0).max(23).default(21),
  quiet_end: z.coerce.number().int().min(0).max(23).default(8),
  enabled: z.boolean().default(true),
});
const EmailSenderSchema = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .refine((value) => {
    if (z.string().email().safeParse(value).success) return true;
    const named = value.match(/^[^<>\r\n]{1,100}\s*<([^<>\r\n]+)>$/);
    return Boolean(named?.[1] && z.string().email().safeParse(named[1].trim()).success);
  }, 'Use email@dominio.com ou Nome <email@dominio.com>.');
const ChannelSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('whatsapp'),
    enabled: z.boolean().default(true),
    credentials: z.object({ access_token: z.string().min(20), phone_number_id: z.string().min(5) }),
    config: z.object({ template_name: z.string().min(1), language: z.string().default('pt_BR') }),
  }),
  z.object({
    kind: z.literal('sms'),
    enabled: z.boolean().default(true),
    credentials: z.object({
      account_sid: z.string().min(10),
      auth_token: z.string().min(10),
      from_number: z.string().min(6),
    }),
    config: z.object({ message: z.string().min(10).max(1000) }),
  }),
  z.object({
    kind: z.literal('email'),
    enabled: z.boolean().default(true),
    credentials: z
      .object({ api_key: z.string().min(10).optional(), from_email: EmailSenderSchema.optional() })
      .optional()
      .default({}),
    config: z.object({
      subject: z
        .string()
        .min(3, 'O assunto precisa ter pelo menos 3 caracteres.')
        .max(200, 'O assunto pode ter no máximo 200 caracteres.'),
      message: z
        .string()
        .min(10, 'O HTML precisa ter pelo menos 10 caracteres.')
        .max(100_000, 'O HTML pode ter no máximo 100.000 caracteres.'),
    }),
  }),
]);
const SendSchema = z.object({ channel: z.enum(['whatsapp', 'sms', 'email']) });
const TestEmailSchema = z.object({
  to: z.string().trim().email().max(320),
  subject: z.string().trim().min(3).max(200),
  message: z.string().min(10).max(100_000),
});
const BulkSendSchema = z.object({
  channel: z.enum(['whatsapp', 'sms', 'email']),
  limit: z.coerce.number().int().min(1).max(100).default(100),
});
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const mask = (value: string | null, kind: 'email' | 'phone') => {
  if (!value) return null;
  if (kind === 'email') {
    const [name, domain] = value.split('@');
    return `${name?.slice(0, 2) ?? ''}***@${domain ?? ''}`;
  }
  return `***${value.replace(/\D/g, '').slice(-4)}`;
};

const appendAttribution = (destination: string, source: Record<string, string>) => {
  const url = new URL(destination);
  for (const [key, value] of Object.entries(source ?? {})) {
    if (
      value &&
      /^(utm_(source|medium|campaign|content|term)|campaign_id|campaign_name|adset_id|adset_name|ad_id|ad_name|placement|site_source_name|fbclid|gclid|src|sck)$/.test(
        key,
      ) &&
      !url.searchParams.has(key)
    ) {
      url.searchParams.set(key, value);
    }
  }
  return url.toString();
};
const renderRecoveryEmail = (message: string, name: string, link: string, openUrl: string) => {
  const rendered = message
    .replaceAll('{{nome}}', name)
    .replaceAll('href="{{link}}"', `href="${link}"`)
    .replaceAll("href='{{link}}'", `href='${link}'`)
    .replaceAll('{{link}}', `<a href="${link}">Retomar compra</a>`);
  const pixel = `<img src="${openUrl}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;opacity:0;overflow:hidden" />`;
  return rendered.includes('</body>')
    ? rendered.replace('</body>', `${pixel}</body>`)
    : `${rendered}${pixel}`;
};

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  const projectFor = async (offerId: string) => {
    const [project] = await app.db!<
      { id: string }[]
    >`SELECT id FROM tracking_projects WHERE offer_id=${offerId} AND enabled=true`;
    if (!project) throw new NotFoundError('Projeto de tracking não encontrado.');
    return project;
  };

  const setupResendWebhook = async (projectId: string) => {
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY) throw new Error('recovery_unavailable');
    const [channel] = await app.db<{ id: string; credentials_encrypted: string }[]>`
      SELECT id,credentials_encrypted FROM recovery_channels WHERE project_id=${projectId} AND kind='email' AND enabled=true`;
    if (!channel) throw new NotFoundError('Canal de e-mail não configurado.');
    const credentials = JSON.parse(
      decryptSecret(channel.credentials_encrypted, env.TRACKING_ENCRYPTION_KEY),
    ) as { api_key: string };
    const token = randomBytes(32).toString('base64url');
    const endpoint = `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/webhooks/recovery/resend?token=${encodeURIComponent(token)}`;
    const response = await fetch('https://api.resend.com/webhooks', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${credentials.api_key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        endpoint,
        events: [
          'email.sent',
          'email.delivered',
          'email.opened',
          'email.clicked',
          'email.bounced',
          'email.failed',
        ],
      }),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(`Resend recusou o webhook (${response.status}): ${JSON.stringify(result)}`);
    await app.db`UPDATE recovery_channels SET webhook_token_hash=${hash(token)},provider_webhook_id=${String((result as { id?: string }).id ?? '') || null},updated_at=now() WHERE id=${channel.id}`;
    return { ok: true, webhook_id: (result as { id?: string }).id ?? null };
  };

  const reconcileResendDeliveries = async (projectId: string) => {
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY) return;
    const db = app.db;
    const [channel] = await db<
      Array<{ id: string; credentials_encrypted: string }>
    >`SELECT id,credentials_encrypted FROM recovery_channels
      WHERE project_id=${projectId} AND kind='email' AND enabled=true`;
    if (!channel) return;
    let apiKey: string;
    try {
      apiKey = (
        JSON.parse(decryptSecret(channel.credentials_encrypted, env.TRACKING_ENCRYPTION_KEY)) as {
          api_key: string;
        }
      ).api_key;
    } catch {
      return;
    }
    const pending = await db<Array<{ id: string; provider_message_id: string }>>`
      SELECT id,provider_message_id FROM recovery_messages
      WHERE channel_id=${channel.id} AND state='sent' AND delivered_at IS NULL
        AND provider_message_id IS NOT NULL AND sent_at>=now()-interval '30 days'
      ORDER BY sent_at DESC LIMIT 20`;
    await Promise.allSettled(
      pending.map(async (message) => {
        const response = await fetch(
          `https://api.resend.com/emails/${encodeURIComponent(message.provider_message_id)}`,
          {
            headers: { authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(3_000),
          },
        );
        if (!response.ok) return;
        const result = (await response.json()) as { last_event?: string };
        const lastEvent = result.last_event ?? '';
        if (['delivered', 'opened', 'clicked'].includes(lastEvent)) {
          await db`UPDATE recovery_messages SET state='delivered',
            delivered_at=COALESCE(delivered_at,now())
            WHERE id=${message.id}`;
        } else if (['bounced', 'failed', 'complained'].includes(lastEvent)) {
          await db`UPDATE recovery_messages SET state='failed',
            bounced_at=CASE WHEN ${lastEvent}='bounced' THEN COALESCE(bounced_at,now()) ELSE bounced_at END,
            last_error=${`resend:${lastEvent}`} WHERE id=${message.id}`;
        }
      }),
    );
  };

  app.get<{ Params: { id: string } }>('/offers/:id/recovery', async (req, reply) => {
    await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
    const project = await projectFor(req.params.id);
    await reconcileResendDeliveries(project.id);
    const [settings] = await app.db`SELECT checkout_url,sender_name,quiet_start,quiet_end,enabled,
        email_automation_enabled,email_delay_minutes,automation_started_at
        FROM recovery_settings WHERE project_id=${project.id}`;
    const [sources] = await app.db<
      Array<{
        gateway: string | null;
        gateway_enabled: boolean;
        ab_test: string | null;
        ab_destinations: number;
        entry_links: number;
        entry_clicks: number;
        vendepay_webhooks: number;
        checkout_destinations: number;
      }>
    >`
      SELECT
        (SELECT provider FROM tracking_gateway_connections WHERE project_id=${project.id} AND enabled=true ORDER BY provider LIMIT 1) AS gateway,
        EXISTS(SELECT 1 FROM vendepay_connections WHERE project_id=${project.id} AND enabled=true) AS gateway_enabled,
        (SELECT name FROM tracking_ab_tests WHERE project_id=${project.id} AND status='active' AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1) AS ab_test,
        (SELECT count(*)::int FROM tracking_ab_variants v JOIN tracking_ab_tests t ON t.id=v.test_id WHERE t.project_id=${project.id} AND v.destination_url IS NOT NULL) AS ab_destinations,
        (SELECT count(*)::int FROM tracking_entry_links WHERE project_id=${project.id} AND enabled=true) AS entry_links,
        (SELECT count(*)::int FROM tracking_events WHERE project_id=${project.id} AND event_name='AdClick' AND received_at>=now()-interval '30 days') AS entry_clicks,
        (SELECT count(*)::int FROM webhook_receipts wr JOIN vendepay_connections vc ON vc.id=wr.connection_id WHERE vc.project_id=${project.id} AND wr.received_at>=now()-interval '30 days') AS vendepay_webhooks,
        (SELECT count(DISTINCT properties->>'href')::int FROM tracking_events WHERE project_id=${project.id} AND event_name='InitiateCheckout' AND received_at>=now()-interval '30 days' AND NULLIF(properties->>'href','') IS NOT NULL) AS checkout_destinations
    `;
    const channels = await app.db<
      Array<{
        id: string;
        kind: string;
        enabled: boolean;
        credentials_encrypted: string;
        config: Record<string, unknown>;
        updated_at: Date;
      }>
    >`
      SELECT id, kind, enabled, credentials_encrypted, config, updated_at FROM recovery_channels WHERE project_id=${project.id} ORDER BY kind
    `;
    const opportunities = await app.db<Array<Record<string, unknown>>>`
      SELECT ro.id, ro.status, ro.reason, ro.buyer_name, ro.email, ro.phone, ro.created_at,
             ro.last_contact_at, ro.clicked_at, ro.recovered_at, o.external_id, o.amount_minor,
             o.amount_brl_minor, o.currency, o.product,
             (SELECT count(*)::int FROM recovery_messages rm WHERE rm.opportunity_id=ro.id) AS messages,
             (SELECT rm.state FROM recovery_messages rm JOIN recovery_channels rc ON rc.id=rm.channel_id
              WHERE rm.opportunity_id=ro.id AND rc.kind='email' ORDER BY rm.created_at DESC LIMIT 1) AS last_message_state,
             (SELECT max(rm.delivered_at) FROM recovery_messages rm JOIN recovery_channels rc ON rc.id=rm.channel_id WHERE rm.opportunity_id=ro.id AND rc.kind='email') AS email_delivered_at,
             (SELECT max(rm.opened_at) FROM recovery_messages rm JOIN recovery_channels rc ON rc.id=rm.channel_id WHERE rm.opportunity_id=ro.id AND rc.kind='email') AS email_opened_at,
             (SELECT max(rm.clicked_at) FROM recovery_messages rm JOIN recovery_channels rc ON rc.id=rm.channel_id WHERE rm.opportunity_id=ro.id AND rc.kind='email') AS email_clicked_at,
             EXISTS(SELECT 1 FROM recovery_messages previous
               JOIN recovery_channels previous_channel ON previous_channel.id=previous.channel_id AND previous_channel.kind='email'
               JOIN recovery_opportunities previous_opportunity ON previous_opportunity.id=previous.opportunity_id
               WHERE previous_opportunity.project_id=ro.project_id
                 AND lower(trim(previous_opportunity.email))=lower(trim(ro.email))
                 AND previous.state IN ('sent','delivered','read')) AS email_already_sent
      FROM recovery_opportunities ro JOIN tracking_orders o ON o.id=ro.order_id
      WHERE ro.project_id=${project.id} ORDER BY ro.created_at DESC LIMIT 100
    `;
    const activity = await app.db<Array<Record<string, unknown>>>`
      SELECT rme.id,rme.event_type,rme.event_at,rme.url,rc.kind AS channel,
        ro.id AS opportunity_id,ro.buyer_name,ro.email,ro.phone,
        o.external_id,o.product,rm.state AS message_state
      FROM recovery_message_events rme
      JOIN recovery_messages rm ON rm.id=rme.message_id
      JOIN recovery_channels rc ON rc.id=rm.channel_id
      JOIN recovery_opportunities ro ON ro.id=rme.opportunity_id
      JOIN tracking_orders o ON o.id=ro.order_id
      WHERE ro.project_id=${project.id}
      ORDER BY rme.event_at DESC LIMIT 250
    `;
    const conversions = await app.db<Array<Record<string, unknown>>>`
      SELECT ro.id AS opportunity_id,ro.recovered_at,ro.recovered_channel,
        original.external_id AS original_external_id,recovered.external_id AS recovered_external_id,
        COALESCE(recovered.amount_brl_minor,recovered.amount_minor,0) AS recovered_minor,
        recovered.currency,recovered.product,ro.buyer_name,ro.email,ro.phone,
        rm.sent_at,rm.opened_at,rm.clicked_at
      FROM recovery_opportunities ro
      JOIN tracking_orders original ON original.id=ro.order_id
      JOIN tracking_orders recovered ON recovered.id=ro.recovered_order_id
      LEFT JOIN recovery_messages rm ON rm.id=ro.recovered_message_id
      WHERE ro.project_id=${project.id} AND ro.status='recovered'
      ORDER BY ro.recovered_at DESC LIMIT 100
    `;
    const testRuns = await app.db<Array<Record<string, unknown>>>`
      SELECT rtr.id,rtr.recipient,rtr.state,rtr.sent_at,rtr.opened_at,rtr.clicked_at,
        rtr.checkout_at,rtr.created_at,
        count(rte.id) FILTER (WHERE rte.event_type='opened')::int AS open_count,
        count(rte.id) FILTER (WHERE rte.event_type='clicked')::int AS click_count,
        count(rte.id) FILTER (WHERE rte.event_type='checkout')::int AS checkout_count
      FROM recovery_test_runs rtr
      LEFT JOIN recovery_test_events rte ON rte.test_run_id=rtr.id
      WHERE rtr.project_id=${project.id}
      GROUP BY rtr.id ORDER BY rtr.created_at DESC LIMIT 10`;
    const totals = await app.db<
      Array<{
        eligible: number;
        contacted: number;
        clicked: number;
        recovered: number;
        recovered_minor: string;
      }>
    >`
      SELECT count(*) FILTER (WHERE ro.status='eligible')::int AS eligible,
        count(*) FILTER (WHERE ro.status='contacted')::int AS contacted,
        count(*) FILTER (WHERE ro.clicked_at IS NOT NULL)::int AS clicked,
        count(*) FILTER (WHERE ro.status='recovered' AND ro.recovered_message_id IS NOT NULL)::int AS recovered,
        COALESCE(sum(COALESCE(recovered.amount_brl_minor,o.amount_brl_minor)) FILTER (WHERE ro.status='recovered' AND ro.recovered_message_id IS NOT NULL),0)::text AS recovered_minor
      FROM recovery_opportunities ro JOIN tracking_orders o ON o.id=ro.order_id
      LEFT JOIN tracking_orders recovered ON recovered.id=ro.recovered_order_id
      WHERE ro.project_id=${project.id}
    `;
    const [emailMetrics] = await app.db<
      Array<{
        sent: number;
        delivered: number;
        opened: number;
        clicked: number;
        converted: number;
        recovered_minor: string;
      }>
    >`
      WITH email_opps AS (
        SELECT ro.id,ro.status,ro.recovered_channel,COALESCE(recovered.amount_brl_minor,recovered.amount_minor,0) AS amount,
          bool_or(rm.state IN ('sent','delivered','read')) AS sent,
          bool_or(rm.delivered_at IS NOT NULL) AS delivered,bool_or(rm.opened_at IS NOT NULL) AS opened,
          bool_or(rm.clicked_at IS NOT NULL OR ro.clicked_at IS NOT NULL) AS clicked
        FROM recovery_messages rm JOIN recovery_channels rc ON rc.id=rm.channel_id AND rc.kind='email'
        JOIN recovery_opportunities ro ON ro.id=rm.opportunity_id JOIN tracking_orders o ON o.id=ro.order_id
        LEFT JOIN tracking_orders recovered ON recovered.id=ro.recovered_order_id WHERE ro.project_id=${project.id}
        GROUP BY ro.id,ro.status,ro.recovered_channel,recovered.amount_brl_minor,recovered.amount_minor)
      SELECT count(*) FILTER(WHERE sent)::int AS sent,count(*) FILTER(WHERE delivered)::int AS delivered,
        count(*) FILTER(WHERE opened)::int AS opened,count(*) FILTER(WHERE clicked)::int AS clicked,
        count(*) FILTER(WHERE status='recovered' AND recovered_channel='email')::int AS converted,
        COALESCE(sum(amount) FILTER(WHERE status='recovered' AND recovered_channel='email'),0)::text AS recovered_minor FROM email_opps`;
    return {
      settings: settings ?? null,
      sources: {
        ...sources,
        gateway: sources?.gateway ?? (sources?.gateway_enabled ? 'vendepay' : null),
        automatic: Boolean(
          sources?.gateway_enabled &&
            ((sources?.ab_destinations ?? 0) > 0 ||
              (sources?.checkout_destinations ?? 0) > 0 ||
              settings?.checkout_url),
        ),
      },
      channels: channels.map(({ credentials_encrypted, ...c }) => {
        let from_email: string | null = null;
        if (c.kind === 'email' && env.TRACKING_ENCRYPTION_KEY) {
          try {
            const credentials = JSON.parse(
              decryptSecret(credentials_encrypted, env.TRACKING_ENCRYPTION_KEY),
            ) as { from_email?: string };
            from_email = credentials.from_email ?? null;
          } catch {
            from_email = null;
          }
        }
        return { ...c, configured: true, from_email };
      }),
      totals: totals[0],
      email_metrics: {
        ...emailMetrics,
        open_rate: emailMetrics?.delivered ? emailMetrics.opened / emailMetrics.delivered : 0,
        click_rate: emailMetrics?.delivered ? emailMetrics.clicked / emailMetrics.delivered : 0,
        conversion_rate: emailMetrics?.sent ? emailMetrics.converted / emailMetrics.sent : 0,
      },
      opportunities: opportunities.map((o) => ({
        ...o,
        email: mask(o.email as string | null, 'email'),
        phone: mask(o.phone as string | null, 'phone'),
        has_email: Boolean(o.email),
        has_phone: Boolean(o.phone),
      })),
      activity: activity.map((event) => ({
        ...event,
        email: mask(event.email as string | null, 'email'),
        phone: mask(event.phone as string | null, 'phone'),
      })),
      conversions: conversions.map((conversion) => ({
        ...conversion,
        email: mask(conversion.email as string | null, 'email'),
        phone: mask(conversion.phone as string | null, 'phone'),
      })),
      test_runs: testRuns.map((run) => ({
        ...run,
        recipient: mask(run.recipient as string, 'email'),
      })),
    };
  });

  app.put<{ Params: { id: string }; Body: unknown }>(
    '/offers/:id/recovery/settings',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send();
      const parsed = SettingsSchema.safeParse(req.body);
      if (!parsed.success) throw zodToProblem(parsed.error);
      const project = await projectFor(req.params.id);
      const s = parsed.data;
      await app.db`INSERT INTO recovery_settings(project_id,checkout_url,sender_name,quiet_start,quiet_end,enabled) VALUES(${project.id},${s.checkout_url || null},${s.sender_name},${s.quiet_start},${s.quiet_end},${s.enabled}) ON CONFLICT(project_id) DO UPDATE SET checkout_url=EXCLUDED.checkout_url,sender_name=EXCLUDED.sender_name,quiet_start=EXCLUDED.quiet_start,quiet_end=EXCLUDED.quiet_end,enabled=EXCLUDED.enabled,updated_at=now()`;
      return { ok: true };
    },
  );

  app.post<{ Params: { id: string } }>('/offers/:id/recovery/email-webhook', async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    const project = await projectFor(req.params.id);
    try {
      return reply.code(201).send(await setupResendWebhook(project.id));
    } catch (error) {
      return reply
        .code(502)
        .send({ error: 'resend_webhook_failed', detail: (error as Error).message });
    }
  });

  app.post<{ Params: { id: string }; Body: unknown }>(
    '/offers/:id/recovery/test-email',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY)
        return reply.code(503).send({ error: 'recovery_unavailable' });
      const parsed = TestEmailSchema.safeParse(req.body);
      if (!parsed.success) throw zodToProblem(parsed.error);
      const project = await projectFor(req.params.id);
      const [channel] = await app.db<
        Array<{ credentials_encrypted: string }>
      >`SELECT credentials_encrypted FROM recovery_channels WHERE project_id=${project.id} AND kind='email' AND enabled=true`;
      if (!channel) return reply.code(409).send({ error: 'email_channel_not_configured' });
      const credentials = JSON.parse(
        decryptSecret(channel.credentials_encrypted, env.TRACKING_ENCRYPTION_KEY),
      ) as { api_key: string; from_email: string };
      const [destination] = await app.db<Array<{ url: string | null }>>`
        SELECT COALESCE(
          (SELECT checkout_url FROM recovery_settings WHERE project_id=${project.id}),
          (SELECT v.destination_url FROM tracking_ab_variants v
            JOIN tracking_ab_tests t ON t.id=v.test_id
            WHERE t.project_id=${project.id} AND t.status='active' AND t.deleted_at IS NULL
              AND v.destination_url IS NOT NULL ORDER BY t.created_at DESC,v.position LIMIT 1),
          (SELECT properties->>'href' FROM tracking_events WHERE project_id=${project.id}
            AND event_name='InitiateCheckout' AND NULLIF(properties->>'href','') IS NOT NULL
            ORDER BY received_at DESC LIMIT 1)
        ) AS url`;
      if (!destination?.url)
        return reply.code(409).send({ error: 'recovery_checkout_not_configured' });
      const testId = ulid();
      const token = randomBytes(24).toString('base64url');
      const link = `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/recovery/test/${token}`;
      const openUrl = `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/recovery/test/open/${token}`;
      const html = renderRecoveryEmail(parsed.data.message, 'Cliente Teste', link, openUrl);
      await app.db`INSERT INTO recovery_test_runs(id,project_id,recipient,token_hash,destination_url) VALUES(${testId},${project.id},${parsed.data.to},${hash(token)},${destination.url})`;
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${credentials.api_key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: credentials.from_email,
          to: [parsed.data.to],
          subject: parsed.data.subject,
          html,
          headers: { 'X-Entity-Ref-ID': `tmx-test-${ulid()}` },
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        await app.db`UPDATE recovery_test_runs SET state='failed' WHERE id=${testId}`;
        return reply.code(502).send({
          error: 'test_email_rejected',
          provider_status: response.status,
          detail: result,
        });
      }
      const providerMessageId = (result as { id?: string }).id ?? null;
      await app.db`UPDATE recovery_test_runs SET state='sent',provider_message_id=${providerMessageId},sent_at=now() WHERE id=${testId}`;
      return reply
        .code(202)
        .send({ accepted: true, provider_message_id: providerMessageId, test_id: testId });
    },
  );

  app.put<{ Params: { id: string }; Body: unknown }>(
    '/offers/:id/recovery/channels',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY)
        return reply.code(503).send({ error: 'encryption_unavailable' });
      const parsed = ChannelSchema.safeParse(req.body);
      if (!parsed.success) throw zodToProblem(parsed.error);
      const project = await projectFor(req.params.id);
      const value = parsed.data;
      let credentials = value.credentials;
      if (value.kind === 'email') {
        const [existing] = await app.db<{ credentials_encrypted: string }[]>`
          SELECT credentials_encrypted FROM recovery_channels WHERE project_id=${project.id} AND kind='email'`;
        let saved: { api_key?: string; from_email?: string } = {};
        if (existing) {
          saved = JSON.parse(
            decryptSecret(existing.credentials_encrypted, env.TRACKING_ENCRYPTION_KEY),
          ) as typeof saved;
        }
        const validated = z
          .object({ api_key: z.string().min(10), from_email: EmailSenderSchema })
          .safeParse({ ...saved, ...value.credentials });
        if (!validated.success) throw zodToProblem(validated.error);
        credentials = validated.data;
      }
      await app.db`INSERT INTO recovery_channels(id,project_id,kind,credentials_encrypted,config,enabled) VALUES(${ulid()},${project.id},${value.kind},${encryptSecret(JSON.stringify(credentials), env.TRACKING_ENCRYPTION_KEY)},${app.db.json(value.config as never)},${value.enabled}) ON CONFLICT(project_id,kind) DO UPDATE SET credentials_encrypted=EXCLUDED.credentials_encrypted,config=EXCLUDED.config,enabled=EXCLUDED.enabled,updated_at=now()`;
      let webhook_configured = false;
      let webhook_error: string | null = null;
      if (value.kind === 'email') {
        try {
          await setupResendWebhook(project.id);
          webhook_configured = true;
        } catch (error) {
          webhook_error = (error as Error).message;
        }
      }
      return { ok: true, kind: value.kind, webhook_configured, webhook_error };
    },
  );

  app.post<{ Params: { id: string } }>('/offers/:id/recovery/sync', async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY) return reply.code(503).send();
    const project = await projectFor(req.params.id);
    const [settings] = await app.db<
      { checkout_url: string | null }[]
    >`SELECT checkout_url FROM recovery_settings WHERE project_id=${project.id} AND enabled=true`;
    const candidates = await app.db<
      Array<{
        id: string;
        visitor_id: string | null;
        buyer: { name?: string; email?: string; phone?: string };
        status: string;
        attribution_source: Record<string, string>;
        destination_url: string | null;
      }>
    >`
      SELECT o.id, o.visitor_id, o.buyer, o.status,
        COALESCE(entry.source,'{}'::jsonb) || COALESCE(o.attribution_source,'{}'::jsonb) ||
          jsonb_strip_nulls(jsonb_build_object('tmx_entry_link_id',entry.entry_link_id,'tmx_entry_link_name',entry.entry_link_name,'vendepay_webhook_id',receipt.id)) AS attribution_source,
        COALESCE(assigned.destination_url, sourced.destination_url, checkout_touch.destination_url, selected.destination_url, common_checkout.destination_url,
          NULLIF(COALESCE(receipt.payload#>>'{checkout,url}',receipt.payload#>>'{data,checkout,url}',receipt.payload#>>'{order,checkout_url}',receipt.payload->>'checkout_url'),''),
          ${settings?.checkout_url ?? null}) AS destination_url
      FROM tracking_orders o
      JOIN LATERAL (
        SELECT wr.id,wr.payload FROM webhook_receipts wr JOIN vendepay_connections vc ON vc.id=wr.connection_id
        WHERE wr.order_id=o.id AND vc.project_id=o.project_id ORDER BY wr.received_at DESC LIMIT 1
      ) receipt ON true
      LEFT JOIN LATERAL (
        SELECT v.destination_url FROM tracking_ab_assignments a JOIN tracking_ab_variants v ON v.id=a.variant_id
        WHERE a.visitor_id=o.visitor_id AND v.destination_url IS NOT NULL ORDER BY a.created_at DESC LIMIT 1
      ) assigned ON true
      LEFT JOIN tracking_ab_variants sourced ON sourced.id=COALESCE(o.attribution_source->>'ab_variant_id', o.attribution_source->>'ab_variant')
      LEFT JOIN LATERAL (
        SELECT NULLIF(e.properties->>'href','') AS destination_url FROM tracking_events e
        WHERE e.project_id=o.project_id AND e.visitor_id=o.visitor_id AND e.event_name='InitiateCheckout' AND NULLIF(e.properties->>'href','') IS NOT NULL
        ORDER BY e.received_at DESC LIMIT 1
      ) checkout_touch ON true
      LEFT JOIN LATERAL (
        SELECT v.destination_url FROM tracking_ab_tests t JOIN tracking_ab_variants v ON v.test_id=t.id
        WHERE t.project_id=o.project_id AND t.deleted_at IS NULL AND v.destination_url IS NOT NULL
        ORDER BY (v.id=t.winner_variant_id) DESC, (t.status='active') DESC, t.created_at DESC, v.position LIMIT 1
      ) selected ON true
      LEFT JOIN LATERAL (
        SELECT NULLIF(e.properties->>'href','') AS destination_url FROM tracking_events e
        WHERE e.project_id=o.project_id AND e.event_name='InitiateCheckout' AND e.received_at>=now()-interval '30 days' AND NULLIF(e.properties->>'href','') IS NOT NULL
        GROUP BY e.properties->>'href' ORDER BY count(*) DESC, max(e.received_at) DESC LIMIT 1
      ) common_checkout ON true
      LEFT JOIN LATERAL (
        SELECT e.source,l.id AS entry_link_id,l.name AS entry_link_name
        FROM tracking_events e JOIN tracking_entry_links l ON l.id=e.properties->>'entry_link_id'
        WHERE e.project_id=o.project_id AND e.visitor_id=o.visitor_id AND e.event_name='AdClick'
        ORDER BY e.received_at ASC LIMIT 1
      ) entry ON true
      WHERE o.project_id=${project.id} AND o.status IN ('abandoned','refused','failed')
        AND o.updated_at >= now()-interval '30 days' AND (NULLIF(o.buyer->>'email','') IS NOT NULL OR NULLIF(o.buyer->>'phone','') IS NOT NULL)
    `;
    let created = 0;
    let skipped = 0;
    for (const order of candidates) {
      if (!order.destination_url) {
        skipped++;
        continue;
      }
      let destination: string;
      try {
        destination = appendAttribution(order.destination_url, order.attribution_source);
      } catch {
        skipped++;
        continue;
      }
      const token = randomBytes(24).toString('base64url');
      const rows = await app.db`
      INSERT INTO recovery_opportunities(id,project_id,order_id,visitor_id,buyer_name,email,phone,reason,recovery_token_hash,recovery_token_encrypted,destination_url,original_source)
      VALUES(${ulid()},${project.id},${order.id},${order.visitor_id},${order.buyer.name ?? null},${order.buyer.email ?? null},${order.buyer.phone ?? null},${order.status},${hash(token)},${encryptSecret(token, env.TRACKING_ENCRYPTION_KEY)},${destination},${app.db.json(order.attribution_source as never)})
      ON CONFLICT(project_id,order_id) DO UPDATE SET destination_url=EXCLUDED.destination_url, original_source=EXCLUDED.original_source, updated_at=now() RETURNING (xmax = 0) AS inserted`;
      if (rows[0]?.inserted) created++;
    }
    return reply
      .code(202)
      .send({ accepted: true, candidates: candidates.length, created, skipped });
  });

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
};

export default plugin;
