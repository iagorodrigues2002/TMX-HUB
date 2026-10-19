import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import {
  buildTikTokPixelScript,
  buildTrackerScript,
  buildVturbBridgeScriptV2,
} from '../../services/tracker-script.js';
import { transparentGif } from './browser-request.js';
import { tokenHash } from './webhook-security.js';

export function registerPostWebhooksRecoveryResendRoutes(app: FastifyInstance) {
  app.post<{
    Querystring: { token?: string };
    Body: {
      type?: string;
      created_at?: string;
      data?: { email_id?: string; click?: { link?: string } };
      [key: string]: unknown;
    };
  }>('/webhooks/recovery/resend', async (req, reply) => {
    if (!app.db || !req.query.token || req.query.token.length > 256)
      return reply.code(404).send({ accepted: false });
    const eventType = req.body?.type ?? '';
    const emailId = req.body?.data?.email_id;
    if (!emailId || !eventType.startsWith('email.'))
      return reply.code(400).send({ accepted: false });
    const rows = await app.db<Array<{ id: string; opportunity_id: string }>>`
      UPDATE recovery_messages rm SET
        state=CASE WHEN ${eventType} IN ('email.delivered','email.opened','email.clicked') AND rm.state='sent' THEN 'delivered' WHEN ${eventType} IN ('email.failed','email.bounced') THEN 'failed' ELSE rm.state END,
        delivered_at=CASE WHEN ${eventType} IN ('email.delivered','email.opened','email.clicked') THEN COALESCE(rm.delivered_at,now()) ELSE rm.delivered_at END,
        opened_at=CASE WHEN ${eventType}='email.opened' THEN COALESCE(rm.opened_at,now()) ELSE rm.opened_at END,
        clicked_at=CASE WHEN ${eventType}='email.clicked' THEN COALESCE(rm.clicked_at,now()) ELSE rm.clicked_at END,
        bounced_at=CASE WHEN ${eventType}='email.bounced' THEN COALESCE(rm.bounced_at,now()) ELSE rm.bounced_at END,
        provider_event=rm.provider_event||${app.db.json(req.body as never)}
      FROM recovery_channels rc WHERE rm.channel_id=rc.id AND rc.webhook_token_hash=${tokenHash(req.query.token)} AND rm.provider_message_id=${emailId}
      RETURNING rm.id,rm.opportunity_id`;
    if (rows[0]) {
      const mapped = eventType.replace('email.', '');
      if (['sent', 'delivered', 'opened', 'clicked', 'bounced', 'failed'].includes(mapped)) {
        const providerEventId = createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
        await app.db`
          INSERT INTO recovery_message_events
            (id,message_id,opportunity_id,event_type,provider_event_id,event_at,url,metadata)
          VALUES (${ulid()},${rows[0].id},${rows[0].opportunity_id},${mapped},${providerEventId},
            ${req.body.created_at ?? new Date().toISOString()},${req.body.data?.click?.link ?? null},
            ${app.db.json(req.body as never)})
          ON CONFLICT (message_id,provider_event_id) DO NOTHING`;
      }
    }
    if (rows[0] && eventType === 'email.clicked')
      await app.db`UPDATE recovery_opportunities SET status=CASE WHEN status IN ('eligible','contacted') THEN 'clicked' ELSE status END,clicked_at=COALESCE(clicked_at,now()),updated_at=now() WHERE id=${String(rows[0].opportunity_id)}`;
    let testMatched = false;
    if (!rows[0] && eventType === 'email.opened') {
      const [testRun] = await app.db<Array<{ id: string }>>`
        SELECT rtr.id FROM recovery_test_runs rtr
        JOIN recovery_channels rc ON rc.project_id=rtr.project_id AND rc.kind='email'
        WHERE rc.webhook_token_hash=${tokenHash(req.query.token)}
          AND rtr.provider_message_id=${emailId} LIMIT 1`;
      if (testRun) {
        const providerEventId = createHash('sha256').update(JSON.stringify(req.body)).digest('hex');
        const inserted = await app.db`
          INSERT INTO recovery_test_events(id,test_run_id,event_type,provider_event_id,event_at,metadata)
          VALUES(${ulid()},${testRun.id},'opened',${providerEventId},
            ${req.body.created_at ?? new Date().toISOString()},${app.db.json(req.body as never)})
          ON CONFLICT(test_run_id,provider_event_id) DO NOTHING RETURNING id`;
        if (inserted[0])
          await app.db`UPDATE recovery_test_runs SET opened_at=COALESCE(opened_at,now()) WHERE id=${testRun.id}`;
        testMatched = true;
      }
    }
    return reply.send({ accepted: true, matched: Boolean(rows[0]) || testMatched });
  });

  app.get<{ Params: { token: string }; Querystring: { m?: string } }>(
    '/recovery/r/:token',
    async (req, reply) => {
      if (!app.db || !req.params.token || req.params.token.length > 256)
        return reply.code(404).send({ error: 'recovery_not_found' });
      const [opportunity] = await app.db<{ id: string; destination_url: string }[]>`
      UPDATE recovery_opportunities SET status=CASE WHEN status='eligible' OR status='contacted' THEN 'clicked' ELSE status END,
        clicked_at=COALESCE(clicked_at,now()),updated_at=now()
      WHERE recovery_token_hash=${tokenHash(req.params.token)} AND status NOT IN ('suppressed','expired','recovered')
      RETURNING id,destination_url
    `;
      if (!opportunity) return reply.code(404).send({ error: 'recovery_not_found' });
      let [message] = req.query.m
        ? await app.db<Array<{ id: string; channel: string }>>`
          UPDATE recovery_messages rm SET clicked_at=COALESCE(clicked_at,now()),
            delivered_at=COALESCE(delivered_at,now()),
            state=CASE WHEN rm.state='sent' THEN 'delivered' ELSE rm.state END
          FROM recovery_channels rc
          WHERE rm.channel_id=rc.id AND rm.opportunity_id=${opportunity.id}
            AND rm.click_token_hash=${tokenHash(req.query.m)}
          RETURNING rm.id,rc.kind AS channel`
        : [];
      if (!message && !req.query.m) {
        [message] = await app.db<Array<{ id: string; channel: string }>>`
        SELECT rm.id,rc.kind AS channel FROM recovery_messages rm
        JOIN recovery_channels rc ON rc.id=rm.channel_id
        WHERE rm.opportunity_id=${opportunity.id} AND rm.state IN ('sent','delivered','read')
        ORDER BY rm.sent_at DESC NULLS LAST,rm.created_at DESC LIMIT 1`;
        if (message)
          await app.db`UPDATE recovery_messages SET clicked_at=COALESCE(clicked_at,now()),
            delivered_at=COALESCE(delivered_at,now()),
            state=CASE WHEN state='sent' THEN 'delivered' ELSE state END WHERE id=${message.id}`;
      }
      if (message) {
        await app.db`
        INSERT INTO recovery_message_events
          (id,message_id,opportunity_id,event_type,event_at,url,ip,user_agent,metadata)
        VALUES (${ulid()},${message.id},${opportunity.id},'clicked',now(),${opportunity.destination_url},
          ${req.ip},${req.headers['user-agent'] ?? null},'{}'::jsonb)`;
      }
      const destination = new URL(opportunity.destination_url);
      destination.searchParams.set('tmx_recovery', '1');
      destination.searchParams.set('tmx_recovery_opportunity', opportunity.id);
      if (message) {
        destination.searchParams.set('tmx_recovery_message', message.id);
        destination.searchParams.set('tmx_recovery_channel', message.channel);
      }
      return reply.redirect(destination.toString(), 302);
    },
  );

  app.get<{ Params: { token: string } }>('/recovery/test/:token', async (req, reply) => {
    if (!app.db || !req.params.token || req.params.token.length > 256)
      return reply.code(404).send({ error: 'recovery_test_not_found' });
    const [run] = await app.db<{ id: string; destination_url: string }[]>`
      UPDATE recovery_test_runs SET clicked_at=COALESCE(clicked_at,now()),
        checkout_at=COALESCE(checkout_at,now())
      WHERE token_hash=${tokenHash(req.params.token)} AND state='sent'
      RETURNING id,destination_url`;
    if (!run) return reply.code(404).send({ error: 'recovery_test_not_found' });
    await app.db`
      INSERT INTO recovery_test_events(id,test_run_id,event_type,event_at,metadata)
      VALUES
        (${ulid()},${run.id},'clicked',now(),${app.db.json({ ip: req.ip, user_agent: req.headers['user-agent'] ?? null } as never)}),
        (${ulid()},${run.id},'checkout',now(),${app.db.json({ destination_url: run.destination_url } as never)})`;
    const destination = new URL(run.destination_url);
    destination.searchParams.set('tmx_recovery_test', '1');
    destination.searchParams.set('tmx_recovery_test_id', run.id);
    return reply.redirect(destination.toString(), 302);
  });

  app.get<{ Params: { token: string } }>('/recovery/test/open/:token', async (req, reply) => {
    if (!app.db || !req.params.token || req.params.token.length > 256)
      return reply.code(404).send();
    const [run] = await app.db<{ id: string }[]>`
      UPDATE recovery_test_runs SET opened_at=COALESCE(opened_at,now())
      WHERE token_hash=${tokenHash(req.params.token)} AND state='sent' RETURNING id`;
    if (run)
      await app.db`
        INSERT INTO recovery_test_events(id,test_run_id,event_type,event_at,metadata)
        VALUES(${ulid()},${run.id},'opened',now(),${app.db.json({ source: 'tmx_pixel', ip: req.ip, user_agent: req.headers['user-agent'] ?? null } as never)})`;
    return reply
      .header('content-type', 'image/gif')
      .header('cache-control', 'no-store, no-cache, must-revalidate, max-age=0')
      .header('cdn-cache-control', 'no-store')
      .send(transparentGif);
  });

  app.get<{ Params: { token: string } }>('/recovery/open/:token', async (req, reply) => {
    if (!app.db || !req.params.token || req.params.token.length > 256)
      return reply.code(404).send();
    const [message] = await app.db<{ id: string; opportunity_id: string }[]>`
      UPDATE recovery_messages SET opened_at=COALESCE(opened_at,now()),
        delivered_at=COALESCE(delivered_at,now()),
        state=CASE WHEN state='sent' THEN 'delivered' ELSE state END
      WHERE click_token_hash=${tokenHash(req.params.token)}
      RETURNING id,opportunity_id`;
    if (message)
      await app.db`
        INSERT INTO recovery_message_events(id,message_id,opportunity_id,event_type,event_at,metadata)
        VALUES(${ulid()},${message.id},${message.opportunity_id},'opened',now(),
          ${app.db.json({ source: 'tmx_pixel', ip: req.ip, user_agent: req.headers['user-agent'] ?? null } as never)})`;
    return reply
      .header('content-type', 'image/gif')
      .header('cache-control', 'no-store, no-cache, must-revalidate, max-age=0')
      .header('cdn-cache-control', 'no-store')
      .send(transparentGif);
  });

  app.get<{ Querystring: { key?: string } }>('/track/t.js', async (req, reply) => {
    if (!req.query.key || !app.db) return reply.code(404).send();
    const [project] = await app.db<{ id: string; enabled: boolean }[]>`
      SELECT id, enabled FROM tracking_projects WHERE public_key = ${req.query.key}
    `;
    if (!project?.enabled) return reply.code(404).send();
    const pixels = await app.db<{ pixel_id: string }[]>`
      SELECT pixel_id FROM meta_pixels
      WHERE project_id = ${project.id} AND enabled = true
    `;
    const tikTokPixels = await app.db<{ pixel_code: string }[]>`
      SELECT pixel_code FROM tracking_tiktok_destinations
      WHERE project_id = ${project.id} AND enabled = true
    `;
    const [vturb] = await app.db<{ conversion_param: string }[]>`
      SELECT conversion_param FROM vturb_integrations
      WHERE project_id=${project.id} AND enabled=true
    `;
    return (
      reply
        .header('content-type', 'application/javascript; charset=utf-8')
        // Tracking fixes and pixel changes must reach live funnels immediately.
        // Cloudflare was overriding the browser TTL to four hours, leaving old
        // checkout logic active after a deploy.
        .header('cache-control', 'no-store, no-cache, must-revalidate')
        .header('cloudflare-cdn-cache-control', 'no-store')
        .header('cdn-cache-control', 'no-store')
        .send(
          buildTrackerScript(
            req.query.key,
            pixels.map((pixel) => pixel.pixel_id),
          ) +
            buildTikTokPixelScript(tikTokPixels.map((pixel) => pixel.pixel_code)) +
            (vturb ? buildVturbBridgeScriptV2(req.query.key, vturb.conversion_param) : ''),
        )
    );
  });
}
