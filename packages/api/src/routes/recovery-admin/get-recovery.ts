import type { FastifyInstance } from 'fastify';
import { env } from '../../env.js';
import { zodToProblem } from '../../lib/problem.js';
import { decryptSecret } from '../../lib/secret-box.js';
import type { createProjectForContext } from './project-for-context.js';
import { SettingsSchema, mask } from './settings-schema.js';

export function registerGetRecoveryRoutes(
  app: FastifyInstance,
  context0: ReturnType<typeof createProjectForContext>,
) {
  const { projectFor, setupResendWebhook, reconcileResendDeliveries } = context0;

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
}
