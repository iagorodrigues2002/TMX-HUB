import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../env.js';
import { decryptSecret, encryptSecret } from '../lib/secret-box.js';

const hash = (value: string) => createHash('sha256').update(value).digest('hex');

const appendAttribution = (destination: string, source: Record<string, string>) => {
  const url = new URL(destination);
  for (const [key, value] of Object.entries(source ?? {})) {
    if (
      value &&
      /^(utm_(source|medium|campaign|content|term)|campaign_id|campaign_name|adset_id|adset_name|ad_id|ad_name|placement|site_source_name|fbclid|gclid|src|sck)$/.test(
        key,
      ) &&
      !url.searchParams.has(key)
    )
      url.searchParams.set(key, value);
  }
  return url.toString();
};

const renderEmail = (message: string, name: string, link: string, openUrl: string) => {
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

export async function runRecoveryEmailAutomation(app: { db: FastifyInstance['db'] }) {
  if (!app.db || !env.TRACKING_ENCRYPTION_KEY) return { created: 0, sent: 0, failed: 0 };
  const db = app.db;
  const candidates = await db<
    Array<{
      order_id: string;
      project_id: string;
      visitor_id: string | null;
      buyer_name: string | null;
      email: string;
      phone: string | null;
      status: string;
      destination_url: string;
      source: Record<string, string>;
    }>
  >`
    SELECT o.id AS order_id,o.project_id,o.visitor_id,o.buyer->>'name' AS buyer_name,
      o.buyer->>'email' AS email,o.buyer->>'phone' AS phone,o.status,
      COALESCE(
        assigned.destination_url,
        sourced.destination_url,
        checkout_touch.destination_url,
        selected.destination_url,
        NULLIF(COALESCE(receipt.payload#>>'{checkout,url}',receipt.payload#>>'{data,checkout,url}',
          receipt.payload#>>'{order,checkout_url}',receipt.payload->>'checkout_url'),''),
        rs.checkout_url
      ) AS destination_url,
      COALESCE(entry.source,'{}'::jsonb) || COALESCE(o.attribution_source,'{}'::jsonb) AS source
    FROM tracking_orders o
    JOIN recovery_settings rs ON rs.project_id=o.project_id AND rs.enabled=true
      AND rs.email_automation_enabled=true
    JOIN recovery_channels rc ON rc.project_id=o.project_id AND rc.kind='email' AND rc.enabled=true
    LEFT JOIN LATERAL (
      SELECT wr.payload FROM webhook_receipts wr
      WHERE wr.order_id=o.id ORDER BY wr.received_at DESC LIMIT 1
    ) receipt ON true
    LEFT JOIN LATERAL (
      SELECT v.destination_url FROM tracking_ab_assignments a
      JOIN tracking_ab_variants v ON v.id=a.variant_id
      WHERE a.visitor_id=o.visitor_id AND v.destination_url IS NOT NULL
      ORDER BY a.created_at DESC LIMIT 1
    ) assigned ON true
    LEFT JOIN tracking_ab_variants sourced
      ON sourced.id=COALESCE(o.attribution_source->>'ab_variant_id',o.attribution_source->>'ab_variant')
    LEFT JOIN LATERAL (
      SELECT NULLIF(e.properties->>'href','') AS destination_url FROM tracking_events e
      WHERE e.project_id=o.project_id AND e.visitor_id=o.visitor_id
        AND e.event_name='InitiateCheckout' AND NULLIF(e.properties->>'href','') IS NOT NULL
      ORDER BY e.received_at DESC LIMIT 1
    ) checkout_touch ON true
    LEFT JOIN LATERAL (
      SELECT v.destination_url FROM tracking_ab_tests t
      JOIN tracking_ab_variants v ON v.test_id=t.id
      WHERE t.project_id=o.project_id AND t.deleted_at IS NULL AND v.destination_url IS NOT NULL
      ORDER BY (v.id=t.winner_variant_id) DESC,(t.status='active') DESC,t.created_at DESC,v.position
      LIMIT 1
    ) selected ON true
    LEFT JOIN LATERAL (
      SELECT e.source FROM tracking_events e
      WHERE e.project_id=o.project_id AND e.visitor_id=o.visitor_id AND e.event_name='AdClick'
      ORDER BY e.received_at ASC LIMIT 1
    ) entry ON true
    WHERE o.status IN ('pending','abandoned','refused','failed','cancelled')
      AND NULLIF(o.buyer->>'email','') IS NOT NULL
      AND o.updated_at>=rs.automation_started_at
      AND o.updated_at<=now()-(rs.email_delay_minutes || ' minutes')::interval
      AND NOT EXISTS (SELECT 1 FROM recovery_opportunities ro WHERE ro.project_id=o.project_id AND ro.order_id=o.id)
      AND NOT EXISTS (
        SELECT 1 FROM tracking_orders paid
        WHERE paid.project_id=o.project_id AND paid.status='paid'
          AND paid.occurred_at>=o.occurred_at
          AND lower(paid.buyer->>'email')=lower(o.buyer->>'email')
      )
      AND NOT EXISTS (
        SELECT 1 FROM recovery_email_dispatches red
        WHERE red.project_id=ro.project_id AND red.email_normalized=lower(trim(ro.email))
          AND red.state IN ('reserved','sent')
      )
    ORDER BY o.updated_at ASC LIMIT 100`;

  let created = 0;
  for (const candidate of candidates) {
    let destination: string;
    try {
      destination = appendAttribution(candidate.destination_url, candidate.source);
    } catch {
      continue;
    }
    const token = randomBytes(24).toString('base64url');
    const rows = await db`
      INSERT INTO recovery_opportunities
        (id,project_id,order_id,visitor_id,buyer_name,email,phone,reason,recovery_token_hash,
         recovery_token_encrypted,destination_url,original_source)
      VALUES(${ulid()},${candidate.project_id},${candidate.order_id},${candidate.visitor_id},
        ${candidate.buyer_name},${candidate.email},${candidate.phone},${candidate.status},${hash(token)},
        ${encryptSecret(token, env.TRACKING_ENCRYPTION_KEY)},${destination},${db.json(candidate.source as never)})
      ON CONFLICT(project_id,order_id) DO NOTHING RETURNING id`;
    if (rows[0]) created++;
  }

  const due = await db<
    Array<{
      id: string;
      order_id: string;
      buyer_name: string | null;
      email: string;
      recovery_token_encrypted: string;
      channel_id: string;
      credentials_encrypted: string;
      config: Record<string, string>;
    }>
  >`
    SELECT ro.id,ro.order_id,ro.buyer_name,ro.email,ro.recovery_token_encrypted,
      rc.id AS channel_id,rc.credentials_encrypted,rc.config
    FROM recovery_opportunities ro
    JOIN tracking_orders o ON o.id=ro.order_id AND o.status<>'paid'
    JOIN recovery_channels rc ON rc.project_id=ro.project_id AND rc.kind='email' AND rc.enabled=true
    JOIN recovery_settings rs ON rs.project_id=ro.project_id AND rs.enabled=true
      AND rs.email_automation_enabled=true
    WHERE ro.status='eligible' AND ro.email IS NOT NULL
      AND ro.created_at>=rs.automation_started_at
      AND o.updated_at>=rs.automation_started_at
      AND NOT EXISTS (
        SELECT 1 FROM recovery_messages rm WHERE rm.opportunity_id=ro.id
          AND rm.state IN ('pending','sent','delivered','read')
      )
      AND (SELECT count(*) FROM recovery_messages rm WHERE rm.opportunity_id=ro.id) < 3
      AND NOT EXISTS (
        SELECT 1 FROM recovery_messages rm WHERE rm.opportunity_id=ro.id
          AND rm.state='failed' AND rm.created_at>now()-interval '5 minutes'
      )
      AND NOT EXISTS (
        SELECT 1 FROM tracking_orders paid
        WHERE paid.project_id=ro.project_id AND paid.status='paid'
          AND paid.occurred_at>=o.occurred_at
          AND lower(paid.buyer->>'email')=lower(ro.email)
      )
    ORDER BY ro.created_at ASC LIMIT 100`;

  let sent = 0;
  let failed = 0;
  for (const row of due) {
    const credentials = JSON.parse(
      decryptSecret(row.credentials_encrypted, env.TRACKING_ENCRYPTION_KEY),
    ) as { api_key: string; from_email: string };
    const recoveryToken = decryptSecret(row.recovery_token_encrypted, env.TRACKING_ENCRYPTION_KEY);
    const messageId = ulid();
    const clickToken = randomBytes(24).toString('base64url');
    const link = `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/recovery/r/${recoveryToken}?m=${encodeURIComponent(clickToken)}`;
    const reservation = await db`
      INSERT INTO recovery_email_dispatches(project_id,email_normalized,state,message_id)
      VALUES((SELECT project_id FROM recovery_opportunities WHERE id=${row.id}),
        ${row.email.trim().toLowerCase()},'reserved',NULL)
      ON CONFLICT(project_id,email_normalized) DO UPDATE SET
        state='reserved',message_id=NULL,reserved_at=now(),updated_at=now()
      WHERE recovery_email_dispatches.state='failed'
         OR (recovery_email_dispatches.state='reserved'
             AND recovery_email_dispatches.reserved_at<now()-interval '15 minutes')
      RETURNING project_id`;
    if (!reservation[0]) continue;
    const claimed = await db`INSERT INTO recovery_messages
      (id,opportunity_id,channel_id,state,click_token_hash,content_snapshot)
      VALUES(${messageId},${row.id},${row.channel_id},'pending',${hash(clickToken)},
        ${db.json({ channel: 'email', link, automatic: true } as never)})
      ON CONFLICT DO NOTHING RETURNING id`;
    if (!claimed[0]) continue;
    await db`UPDATE recovery_email_dispatches SET message_id=${messageId},updated_at=now()
      WHERE email_normalized=${row.email.trim().toLowerCase()} AND state='reserved'
        AND message_id IS NULL
        AND project_id=(SELECT project_id FROM recovery_opportunities WHERE id=${row.id})`;
    let response: Response;
    try {
      response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          authorization: `Bearer ${credentials.api_key}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          from: credentials.from_email,
          to: [row.email],
          subject: row.config.subject || 'Sua compra ainda está disponível',
          html: renderEmail(
            row.config.message ||
              '<p>Olá {{nome}},</p><p>notamos que sua compra não foi concluída.</p><p>{{link}}</p>',
            row.buyer_name?.split(/\s+/)[0] || 'cliente',
            link,
            `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/recovery/open/${clickToken}`,
          ),
        }),
        signal: AbortSignal.timeout(10_000),
      });
    } catch (error) {
      await db`UPDATE recovery_messages SET state='failed',last_error=${String(error)} WHERE id=${messageId}`;
      await db`UPDATE recovery_email_dispatches SET state='failed',updated_at=now()
        WHERE message_id=${messageId}`;
      failed++;
      continue;
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      await db`UPDATE recovery_messages SET state='failed',response_status=${response.status},
        last_error=${JSON.stringify(result)} WHERE id=${messageId}`;
      await db`UPDATE recovery_email_dispatches SET state='failed',updated_at=now()
        WHERE message_id=${messageId}`;
      failed++;
      continue;
    }
    await db.begin(async (sql) => {
      await sql`UPDATE recovery_messages SET state='sent',provider_message_id=${String((result as { id?: string }).id ?? '') || null},
        response_status=${response.status},sent_at=now() WHERE id=${messageId}`;
      await sql`INSERT INTO recovery_message_events(id,message_id,opportunity_id,event_type,metadata)
        VALUES(${ulid()},${messageId},${row.id},'sent',${sql.json({ automatic: true, delay_minutes: 10 } as never)})`;
      await sql`UPDATE recovery_opportunities SET status='contacted',first_contact_at=COALESCE(first_contact_at,now()),
        last_contact_at=now(),updated_at=now() WHERE id=${row.id} AND status='eligible'`;
      await sql`UPDATE recovery_email_dispatches SET state='sent',sent_at=now(),updated_at=now()
        WHERE message_id=${messageId}`;
    });
    sent++;
  }
  return { created, sent, failed };
}
