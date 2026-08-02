import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { normalizeVendepay } from '../integrations/vendepay/normalize.js';
import { createTrackingToken, readTrackingToken } from '../lib/tracking-token.js';
import { convertToBrlMinor } from '../services/exchange-rate.js';
import { buildTrackerScript } from '../services/tracker-script.js';

const EventSchema = z.object({
  public_key: z.string().min(16).max(128),
  event_id: z.string().min(8).max(128),
  visitor_id: z.string().min(8).max(128),
  session_id: z.string().min(8).max(128).optional(),
  journey_id: z.string().min(8).max(128).optional(),
  event_name: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .regex(/^[A-Za-z][A-Za-z0-9_.:-]*$/),
  event_category: z.string().trim().min(1).max(40).default('behavior'),
  event_url: z.string().url().max(4096),
  page_title: z.string().max(512).optional(),
  referrer: z.string().url().max(4096).optional().or(z.literal('')),
  source: z.record(z.string(), z.string().max(2048)).default({}),
  properties: z.record(z.string(), z.unknown()).default({}),
  consent_state: z.enum(['granted', 'denied', 'unknown']).optional(),
  client_at: z.string().datetime().optional(),
});

const BootstrapSchema = z.object({
  public_key: z.string().min(16).max(128),
  visitor_id: z.string().min(8).max(128),
  session_id: z.string().min(8).max(128),
  journey_id: z.string().min(8).max(128),
  landing_url: z.string().url().max(4096),
  referrer: z.string().url().max(4096).optional().or(z.literal('')),
  source: z.record(z.string(), z.string().max(2048)).default({}),
  tracking_token: z.string().max(2048).optional(),
});
const AbAssignmentSchema = z.object({
  public_key: z.string().min(8).max(120),
  visitor_id: z.string().min(8).max(120),
});
type AbRedirectRequest = FastifyRequest<{
  Params: { testId: string };
  Querystring: Record<string, string | undefined>;
}>;
type EntryRedirectRequest = FastifyRequest<{
  Params: { slug: string };
  Querystring: Record<string, string | undefined>;
}>;

const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
const attributionQueryKeys = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'sck',
  'fbclid',
  'gclid',
  'ttclid',
  'msclkid',
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'ad_id',
  'ad_name',
  'placement',
  'site_source_name',
  '_fbp',
  '_fbc',
  '_fbclid_ts',
]);

export function extractAttributionQuery(query: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(query).filter(([key, value]) => Boolean(value) && attributionQueryKeys.has(key)),
  ) as Record<string, string>;
}

const campaignAttributionKeys = [
  'campaign_id',
  'campaign_name',
  'utm_campaign',
  'adset_id',
  'ad_id',
] as const;

export function hasCampaignAttribution(source: Record<string, string>) {
  return campaignAttributionKeys.some((key) => Boolean(source[key]?.trim()));
}

export function validBrowserEventId(value: string | undefined) {
  return value && /^[A-Za-z0-9_-]{8,128}$/.test(value) ? value : undefined;
}

export function safeEventSourceUrl(value: string | undefined) {
  if (!value || value.length > 4096) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

const cookieValue = (cookie: string | undefined, name: string) =>
  cookie
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);

function requestCountry(headers: Record<string, string | string[] | undefined>) {
  for (const name of [
    'cf-ipcountry',
    'x-vercel-ip-country',
    'cloudfront-viewer-country',
    'x-country-code',
  ]) {
    const raw = headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value && /^[a-z]{2}$/i.test(value)) return value.toUpperCase();
  }
  return undefined;
}

async function enqueueInitiateCheckout(
  app: FastifyInstance,
  input: { projectId: string; eventId: string; eventAt: Date },
) {
  if (!app.db) return { meta: 0, utmify: 0 };
  const queued = await app.db.begin(async (sql) => {
    const [project] = await sql<{ utmify_pixel_id: string | null }[]>`
      SELECT utmify_pixel_id
      FROM tracking_projects
      WHERE id = ${input.projectId}
    `;
    const pixels = await sql<{ id: string }[]>`
      SELECT id FROM meta_pixels
      WHERE project_id = ${input.projectId} AND enabled = true
      ORDER BY created_at ASC
    `;
    const meta: Array<{ id: string }> = [];
    for (const pixel of pixels) {
      const rows = await sql<{ id: string }[]>`
        INSERT INTO meta_deliveries
          (id, project_id, pixel_id, order_id, event_id, event_name, event_at)
        VALUES
          (${ulid()}, ${input.projectId}, ${pixel.id}, NULL, ${input.eventId},
           'InitiateCheckout', ${input.eventAt})
        ON CONFLICT (pixel_id, event_id) DO NOTHING
        RETURNING id
      `;
      if (rows[0]) meta.push(rows[0]);
    }
    const utmify: Array<{ id: string }> = [];
    if (project?.utmify_pixel_id) {
      const webEvents = await sql<{ id: string }[]>`
        INSERT INTO tracking_utmify_web_events
          (id, project_id, pixel_id, external_pixel_id, event_id, event_name)
        VALUES
          (${ulid()}, ${input.projectId}, NULL, ${project.utmify_pixel_id},
           ${input.eventId}, 'InitiateCheckout')
        ON CONFLICT (project_id, event_id) DO NOTHING
        RETURNING id
      `;
      if (webEvents[0]) utmify.push(webEvents[0]);
    }
    return { meta, utmify };
  });
  await Promise.allSettled([
    ...queued.meta.map((delivery) => app.metaQueue.add('send', { deliveryId: delivery.id })),
    ...queued.utmify.map((delivery) =>
      app.utmifyWebEventQueue.add('send', { deliveryId: delivery.id }),
    ),
  ]);
  return { meta: queued.meta.length, utmify: queued.utmify.length };
}

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.post<{
    Querystring: { token?: string };
    Body: { type?: string; created_at?: string; data?: { email_id?: string } };
  }>('/webhooks/recovery/resend', async (req, reply) => {
    if (!app.db || !req.query.token || req.query.token.length > 256)
      return reply.code(404).send({ accepted: false });
    const eventType = req.body?.type ?? '';
    const emailId = req.body?.data?.email_id;
    if (!emailId || !eventType.startsWith('email.'))
      return reply.code(400).send({ accepted: false });
    const rows = await app.db<Array<{ opportunity_id: string }>>`
      UPDATE recovery_messages rm SET
        state=CASE WHEN ${eventType}='email.delivered' AND rm.state='sent' THEN 'delivered' WHEN ${eventType} IN ('email.failed','email.bounced') THEN 'failed' ELSE rm.state END,
        delivered_at=CASE WHEN ${eventType}='email.delivered' THEN COALESCE(rm.delivered_at,now()) ELSE rm.delivered_at END,
        opened_at=CASE WHEN ${eventType}='email.opened' THEN COALESCE(rm.opened_at,now()) ELSE rm.opened_at END,
        clicked_at=CASE WHEN ${eventType}='email.clicked' THEN COALESCE(rm.clicked_at,now()) ELSE rm.clicked_at END,
        bounced_at=CASE WHEN ${eventType}='email.bounced' THEN COALESCE(rm.bounced_at,now()) ELSE rm.bounced_at END,
        provider_event=rm.provider_event||${app.db.json(req.body as never)}
      FROM recovery_channels rc WHERE rm.channel_id=rc.id AND rc.webhook_token_hash=${tokenHash(req.query.token)} AND rm.provider_message_id=${emailId}
      RETURNING rm.opportunity_id`;
    if (rows[0] && eventType === 'email.clicked')
      await app.db`UPDATE recovery_opportunities SET status=CASE WHEN status IN ('eligible','contacted') THEN 'clicked' ELSE status END,clicked_at=COALESCE(clicked_at,now()),updated_at=now() WHERE id=${String(rows[0].opportunity_id)}`;
    return reply.send({ accepted: true, matched: Boolean(rows[0]) });
  });

  app.get<{ Params: { token: string } }>('/recovery/r/:token', async (req, reply) => {
    if (!app.db || !req.params.token || req.params.token.length > 256)
      return reply.code(404).send({ error: 'recovery_not_found' });
    const [opportunity] = await app.db<{ id: string; destination_url: string }[]>`
      UPDATE recovery_opportunities SET status=CASE WHEN status='eligible' OR status='contacted' THEN 'clicked' ELSE status END,
        clicked_at=COALESCE(clicked_at,now()),updated_at=now()
      WHERE recovery_token_hash=${tokenHash(req.params.token)} AND status NOT IN ('suppressed','expired','recovered')
      RETURNING id,destination_url
    `;
    if (!opportunity) return reply.code(404).send({ error: 'recovery_not_found' });
    await app.db`UPDATE recovery_messages SET clicked_at=COALESCE(clicked_at,now()) WHERE opportunity_id=${opportunity.id} AND channel_id IN (SELECT id FROM recovery_channels WHERE kind='email')`;
    return reply.redirect(opportunity.destination_url, 302);
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
          ),
        )
    );
  });

  app.post('/track/bootstrap', { bodyLimit: 64 * 1024 }, async (req, reply) => {
    if (!app.db) return reply.code(503).send({ accepted: false });
    const parsed = BootstrapSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ accepted: false });
    const input = parsed.data;
    const [project] = await app.db<{ id: string; enabled: boolean }[]>`
      SELECT id, enabled FROM tracking_projects WHERE public_key = ${input.public_key}
    `;
    if (!project?.enabled) return reply.code(404).send({ accepted: false });
    const linkedIdentity = input.tracking_token
      ? readTrackingToken(input.tracking_token, env.WEBHOOK_SECRET)
      : null;
    const visitorId =
      linkedIdentity?.projectId === project.id ? linkedIdentity.visitorId : input.visitor_id;
    const journeyId =
      linkedIdentity?.projectId === project.id ? linkedIdentity.journeyId : input.journey_id;
    const country = requestCountry(req.headers);
    const source = country ? { ...input.source, country } : input.source;
    await app.db.begin(async (sql) => {
      await sql`
        INSERT INTO tracking_visitors
          (project_id, visitor_id, first_source, last_source)
        VALUES
          (${project.id}, ${visitorId}, ${sql.json(source)}, ${sql.json(source)})
        ON CONFLICT (project_id, visitor_id) DO UPDATE SET
          last_source = CASE
            WHEN EXCLUDED.last_source = '{}'::jsonb THEN tracking_visitors.last_source
            ELSE tracking_visitors.last_source || EXCLUDED.last_source
          END,
          last_seen_at = now()
      `;
      await sql`
        INSERT INTO tracking_sessions
          (project_id, session_id, visitor_id, journey_id, landing_url, referrer, source)
        VALUES
          (${project.id}, ${input.session_id}, ${visitorId}, ${journeyId},
           ${input.landing_url}, ${input.referrer || null}, ${sql.json(source)})
        ON CONFLICT (project_id, session_id) DO UPDATE SET last_seen_at = now()
      `;
    });
    return {
      accepted: true,
      visitor_id: visitorId,
      journey_id: journeyId,
      tracking_token: createTrackingToken(
        { projectId: project.id, visitorId, journeyId },
        env.WEBHOOK_SECRET,
      ),
    };
  });

  app.post('/track/ab/assign', { bodyLimit: 16 * 1024 }, async (req, reply) => {
    if (!app.db) return reply.code(503).send({ active: false });
    const parsed = AbAssignmentSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ active: false });
    const input = parsed.data;
    const [test] = await app.db<
      Array<{
        id: string;
        kind: 'checkout' | 'presell';
        traffic_a: number;
        winner_variant_id: string | null;
      }>
    >`
      SELECT t.id, t.kind, t.traffic_a, t.winner_variant_id
      FROM tracking_ab_tests t
      JOIN tracking_projects p ON p.id = t.project_id
      WHERE p.public_key = ${input.public_key}
        AND p.enabled = true
        AND t.status = 'active'
        AND t.deleted_at IS NULL
      LIMIT 1
    `;
    if (!test) return { active: false };
    const variants = await app.db<
      Array<{
        id: string;
        label: string;
        gateway: string | null;
        destination_url: string | null;
        position: number;
      }>
    >`
      SELECT id, label, gateway, destination_url, position
      FROM tracking_ab_variants
      WHERE test_id = ${test.id}
      ORDER BY position
    `;
    if (variants.length !== 2) return { active: false };
    const existing = await app.db<Array<{ variant_id: string }>>`
      SELECT variant_id FROM tracking_ab_assignments
      WHERE test_id = ${test.id} AND visitor_id = ${input.visitor_id}
    `;
    const digest = createHash('sha256')
      .update(`${test.id}|${input.visitor_id}`)
      .digest()
      .readUInt32BE(0);
    const selectedId =
      test.winner_variant_id ??
      existing[0]?.variant_id ??
      (digest % 100 < test.traffic_a ? variants[0]!.id : variants[1]!.id);
    const selected = variants.find((variant) => variant.id === selectedId) ?? variants[0]!;
    await app.db`
      INSERT INTO tracking_ab_assignments(id, test_id, variant_id, visitor_id)
      VALUES (${ulid()}, ${test.id}, ${selected.id}, ${input.visitor_id})
      ON CONFLICT(test_id, visitor_id) DO NOTHING
    `;
    return {
      active: true,
      test_id: test.id,
      kind: test.kind,
      variant: selected,
    };
  });

  app.get('/c/:slug', async (req: EntryRedirectRequest, reply: FastifyReply) => {
    if (!app.db) return reply.code(503).send({ error: 'tracking_unavailable' });
    const [link] = await app.db<
      Array<{ id: string; project_id: string; destination_url: string; enabled: boolean }>
    >`
      SELECT id, project_id, destination_url, enabled
      FROM tracking_entry_links
      WHERE slug=${req.params.slug}
      LIMIT 1
    `;
    if (!link?.enabled) return reply.code(404).send({ error: 'entry_link_inactive' });
    const destination = new URL(link.destination_url);
    for (const [key, value] of Object.entries(req.query)) {
      if (!value || key === 'tmx_preview') continue;
      destination.searchParams.set(key, value);
    }
    const visitorId = cookieValue(req.headers.cookie, '_tmx_entry_v') || ulid();
    const journeyId = ulid();
    const source = extractAttributionQuery(req.query);
    const country = requestCountry(req.headers);
    const userAgent = req.headers['user-agent'] ?? '';
    const previewOrBot =
      req.query.tmx_preview === '1' ||
      /facebookexternalhit|facebot|meta-externalagent|meta-externalfetcher|bot|crawler|spider|preview/i.test(
        userAgent,
      );
    if (!previewOrBot) {
      await app.db`
        INSERT INTO tracking_events
          (id, project_id, visitor_id, journey_id, event_name, event_category,
           event_url, source, properties, client_ip, user_agent, received_at)
        VALUES
          (${ulid()}, ${link.project_id}, ${visitorId}, ${journeyId}, 'AdClick', 'acquisition',
           ${`${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/c/${req.params.slug}`},
           ${app.db.json({
             ...source,
             ...(country ? { country } : {}),
           } as never)},
           ${app.db.json({ entry_link_id: link.id } as never)},
           ${req.ip}, ${userAgent || null}, now())
      `;
    }
    const trackingToken = createTrackingToken(
      { projectId: link.project_id, visitorId, journeyId },
      env.WEBHOOK_SECRET,
    );
    destination.searchParams.set('src', trackingToken);
    reply.header(
      'set-cookie',
      `_tmx_entry_v=${visitorId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
    );
    return reply.redirect(destination.toString(), 302);
  });

  const abRedirectHandler = async (req: AbRedirectRequest, reply: FastifyReply) => {
    if (!app.db) return reply.code(503).send({ error: 'tracking_unavailable' });
    const [test] = await app.db<
      Array<{
        id: string;
        project_id: string;
        kind: 'checkout' | 'presell';
        status: string;
        traffic_a: number;
        winner_variant_id: string | null;
      }>
    >`
      SELECT id, project_id, kind, status, traffic_a, winner_variant_id
      FROM tracking_ab_tests
      WHERE id=${req.params.testId} AND deleted_at IS NULL
      LIMIT 1
    `;
    if (!test || test.status !== 'active')
      return reply.code(404).send({ error: 'ab_test_inactive' });
    const variants = await app.db<
      Array<{
        id: string;
        label: string;
        destination_url: string | null;
        position: number;
      }>
    >`
      SELECT id, label, destination_url, position
      FROM tracking_ab_variants
      WHERE test_id=${test.id}
      ORDER BY position
    `;
    if (variants.length !== 2) return reply.code(409).send({ error: 'ab_variants_not_configured' });
    if (req.query.tmx_preview === '1') {
      return {
        active: true,
        test_id: test.id,
        traffic_a: test.traffic_a,
        winner_variant_id: test.winner_variant_id,
        variants,
      };
    }
    const linked = req.query.src ? readTrackingToken(req.query.src, env.WEBHOOK_SECRET) : null;
    const linkedIdentity = linked?.projectId === test.project_id ? linked : null;
    const redirectAttribution = extractAttributionQuery(req.query);
    const userAgent = req.headers['user-agent'] ?? null;
    type RecentTouch = {
      visitor_id: string;
      journey_id: string | null;
      source: Record<string, string>;
      event_url: string;
    };
    // Typebot opens the checkout link from a cross-origin iframe. In that flow the
    // browser cannot decorate the link with src/tmx_source_url, so recover the
    // complete ad touch on the server even when the redirect already carries only
    // a partial UTM such as utm_campaign.
    const recentTouches = linkedIdentity
      ? await app.db<RecentTouch[]>`
          SELECT visitor_id, journey_id, source, event_url
          FROM tracking_events
          WHERE project_id = ${test.project_id}
            AND visitor_id = ${linkedIdentity.visitorId}
            AND event_name = 'PageView'
            AND received_at >= now() - interval '30 days'
          ORDER BY received_at DESC, id DESC
          LIMIT 1
        `
      : userAgent
        ? await app.db<RecentTouch[]>`
            SELECT visitor_id, journey_id, source, event_url
            FROM tracking_events
            WHERE project_id = ${test.project_id}
              AND event_name = 'PageView'
              AND client_ip = ${req.ip}
              AND user_agent = ${userAgent}
              AND received_at >= now() - interval '4 hours'
            ORDER BY received_at DESC, id DESC
            LIMIT 1
          `
        : [];
    const recentTouch = recentTouches[0];
    const mergedRecentSource = {
      ...(recentTouch?.source ?? {}),
      ...redirectAttribution,
    };
    // A landing can reopen in another browser context and lose its URL/local
    // storage while keeping the same network and user agent. If the exact
    // visitor touch is empty, prefer the latest attributed touch from that
    // browser instead of emitting an unattributed checkout.
    const [attributedBrowserTouch] =
      userAgent && !hasCampaignAttribution(mergedRecentSource)
        ? await app.db<RecentTouch[]>`
            SELECT visitor_id, journey_id, source, event_url
            FROM tracking_events
            WHERE project_id = ${test.project_id}
              AND event_name = 'PageView'
              AND client_ip = ${req.ip}
              AND user_agent = ${userAgent}
              AND received_at >= now() - interval '4 hours'
              AND (
                NULLIF(source->>'campaign_id', '') IS NOT NULL
                OR NULLIF(source->>'campaign_name', '') IS NOT NULL
                OR NULLIF(source->>'utm_campaign', '') IS NOT NULL
                OR NULLIF(source->>'adset_id', '') IS NOT NULL
                OR NULLIF(source->>'ad_id', '') IS NOT NULL
              )
            ORDER BY received_at DESC, id DESC
            LIMIT 1
          `
        : [];
    const attributionTouch = attributedBrowserTouch ?? recentTouch;
    const visitorId = linkedIdentity
      ? linkedIdentity.visitorId
      : recentTouch?.visitor_id
        ? recentTouch.visitor_id
        : cookieValue(req.headers.cookie, '_tmx_redirect_v') || ulid();
    const journeyId = linkedIdentity?.journeyId ?? recentTouch?.journey_id ?? ulid();
    const existing = await app.db<Array<{ variant_id: string }>>`
      SELECT variant_id FROM tracking_ab_assignments
      WHERE test_id=${test.id} AND visitor_id=${visitorId}
    `;
    const digest = createHash('sha256').update(`${test.id}|${visitorId}`).digest().readUInt32BE(0);
    const selectedId =
      test.winner_variant_id ??
      existing[0]?.variant_id ??
      (digest % 100 < test.traffic_a ? variants[0]!.id : variants[1]!.id);
    const selected = variants.find((variant) => variant.id === selectedId) ?? variants[0]!;
    if (!selected.destination_url) return reply.code(409).send({ error: 'ab_destination_missing' });
    await app.db`
      INSERT INTO tracking_ab_assignments(id, test_id, variant_id, visitor_id)
      VALUES (${ulid()}, ${test.id}, ${selected.id}, ${visitorId})
      ON CONFLICT(test_id, visitor_id) DO NOTHING
    `;
    const destination = new URL(selected.destination_url);
    for (const [key, value] of Object.entries(req.query)) {
      if (
        !value ||
        key === 'tmx_preview' ||
        key === 'src' ||
        key === 'tmx_event_id' ||
        key === 'tmx_source_url'
      )
        continue;
      if (!destination.searchParams.has(key)) destination.searchParams.set(key, value);
    }
    const trackingToken = createTrackingToken(
      { projectId: test.project_id, visitorId, journeyId },
      env.WEBHOOK_SECRET,
    );
    destination.searchParams.set('src', trackingToken);
    destination.searchParams.set('tmx_ab', selected.label);
    const redirectCountry = requestCountry(req.headers);
    const redirectEventId = validBrowserEventId(req.query.tmx_event_id) ?? ulid();
    const redirectEventUrl =
      safeEventSourceUrl(req.query.tmx_source_url) ??
      safeEventSourceUrl(attributionTouch?.event_url) ??
      safeEventSourceUrl(req.headers.referer) ??
      `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/r/${test.id}`;
    const redirectEventAt = new Date();
    await app.db`
      INSERT INTO tracking_events
        (id, project_id, visitor_id, journey_id, event_name, event_category,
         event_url, source, properties, client_ip, user_agent, received_at)
      VALUES
        (${redirectEventId}, ${test.project_id}, ${visitorId}, ${journeyId}, 'InitiateCheckout',
         'commerce', ${redirectEventUrl},
         ${app.db.json({
           ...redirectAttribution,
           // The landing is the authoritative ad touch. Static UTMs pasted into a
           // checkout button must not overwrite the real campaign/ad that brought
           // the visitor to the funnel.
           ...(attributionTouch?.source ?? {}),
           ...(redirectCountry ? { country: redirectCountry } : {}),
         } as never)},
         ${app.db.json({
           ab_test_id: test.id,
           ab_variant_id: selected.id,
           ab_variant: selected.label,
           redirect: true,
         } as never)}, ${req.ip}, ${req.headers['user-agent'] ?? null}, ${redirectEventAt})
    `;
    await enqueueInitiateCheckout(app, {
      projectId: test.project_id,
      eventId: redirectEventId,
      eventAt: redirectEventAt,
    });
    reply.header(
      'set-cookie',
      `_tmx_redirect_v=${visitorId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
    );
    return reply.redirect(destination.toString(), 302);
  };
  app.get('/r/:testId', abRedirectHandler);
  app.get('/link/:testId', abRedirectHandler);

  app.post('/track/events', { bodyLimit: 64 * 1024 }, async (req, reply) => {
    if (!app.db) return reply.code(503).send({ accepted: false });
    const parsed = EventSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ accepted: false });
    const event = parsed.data;
    const [project] = await app.db<{ id: string; enabled: boolean }[]>`
      SELECT id, enabled FROM tracking_projects WHERE public_key = ${event.public_key}
    `;
    if (!project?.enabled) return reply.code(404).send({ accepted: false });
    const country = requestCountry(req.headers);
    const source = country ? { ...event.source, country } : event.source;
    const inserted = await app.db<{ id: string; received_at: Date }[]>`
      INSERT INTO tracking_events
        (id, project_id, visitor_id, session_id, journey_id, event_name, event_category,
         event_url, page_title, referrer, source, properties, consent_state,
         client_ip, user_agent, client_at)
      VALUES
        (${event.event_id}, ${project.id}, ${event.visitor_id}, ${event.session_id ?? null},
         ${event.journey_id ?? null}, ${event.event_name}, ${event.event_category},
         ${event.event_url}, ${event.page_title ?? null}, ${event.referrer || null},
         ${app.db.json(source)}, ${app.db.json(event.properties as never)},
         ${event.consent_state ?? null}, ${req.ip}, ${req.headers['user-agent'] ?? null},
         ${event.client_at ?? null})
      ON CONFLICT (project_id, id) DO NOTHING
      RETURNING id, received_at
    `;
    await app.db`
      UPDATE tracking_visitors SET last_seen_at = now(),
        last_source = CASE
          WHEN ${app.db.json(source)} = '{}'::jsonb THEN last_source
          ELSE last_source || ${app.db.json(source)}
        END
      WHERE project_id = ${project.id} AND visitor_id = ${event.visitor_id}
    `;
    if (event.event_name === 'InitiateCheckout' && inserted[0]) {
      await enqueueInitiateCheckout(app, {
        projectId: project.id,
        eventId: inserted[0].id,
        eventAt: inserted[0].received_at,
      });
    }
    return reply.code(202).send({ accepted: true });
  });

  app.post<{ Querystring: { token?: string } }>(
    '/webhooks/vendepay',
    { bodyLimit: 256 * 1024, logLevel: 'silent' },
    async (req, reply) => {
      if (!app.db || !req.query.token) return reply.code(404).send({ accepted: false });
      const candidate = tokenHash(req.query.token);
      const connections = await app.db<
        Array<{ id: string; project_id: string; token_hash: string; offer_id: string }>
      >`
        SELECT vc.id, vc.project_id, vc.token_hash, tp.offer_id
        FROM vendepay_connections vc
        JOIN tracking_projects tp ON tp.id = vc.project_id
        WHERE vc.token_hash = ${candidate} AND vc.enabled = true
        LIMIT 1
      `;
      const connection = connections[0];
      if (!connection) return reply.code(404).send({ accepted: false });

      const normalized = normalizeVendepay(req.body);
      const receiptId = ulid();
      // Offers live in Redis (OfferStore), not Postgres — resolve the funnel
      // name here (route has app.offerStore) so it can be persisted onto the
      // Pushcut outbox row for the worker (Postgres-only, no Redis access)
      // to read back. Only bother when the webhook could actually produce a
      // delivery.
      const funnelName =
        normalized.kind === 'processable'
          ? ((await app.offerStore.maybeGet(connection.offer_id))?.name ?? null)
          : null;
      // Convert to BRL before opening the DB transaction: the rate fetch can
      // hit the network, and we don't want to hold a Postgres tx open during
      // an outbound HTTP call. If the rate service is down and this currency
      // has never been cached, amount_brl_minor stays NULL and a later replay
      // can fill it in.
      let ingestBrlMinor: number | null = null;
      let ingestExchangeRate: number | null = null;
      if (
        normalized.kind === 'processable' &&
        normalized.event.amountMinor != null &&
        normalized.event.currency
      ) {
        const converted = await convertToBrlMinor(
          normalized.event.amountMinor,
          normalized.event.currency,
          app.db,
        );
        if (converted) {
          ingestBrlMinor = converted.brlMinor;
          ingestExchangeRate = converted.rate;
        }
      }
      const ingestConvertedAt = ingestBrlMinor != null ? new Date() : null;
      const outcome = await app.db.begin(async (sql) => {
        const receipts = await sql<{ id: string }[]>`
          INSERT INTO webhook_receipts
            (id, connection_id, dedupe_key, payload, state, diagnostics)
          VALUES
            (${receiptId}, ${connection.id}, ${normalized.dedupeKey}, ${sql.json(req.body as never)},
             ${normalized.kind}, ${sql.json(normalized.kind === 'quarantined' ? normalized.diagnostics : [])})
          ON CONFLICT (connection_id, dedupe_key) DO NOTHING
          RETURNING id
        `;
        if (receipts.length === 0 || normalized.kind !== 'processable') {
          return {
            inserted: receipts.length > 0,
            deliveryIds: [] as string[],
            utmifyDeliveryIds: [] as string[],
            pushcutDeliveryIds: [] as string[],
          };
        }
        const event = normalized.event;
        const skipsUtmify = event.status === 'cancelled' || event.status === 'abandoned';
        const trackingIdentity = event.trackingSrc
          ? readTrackingToken(event.trackingSrc, env.WEBHOOK_SECRET)
          : null;
        let attributedVisitorId =
          trackingIdentity?.projectId === connection.project_id ? trackingIdentity.visitorId : null;
        // Older checkout links sometimes carried a plain visitor id instead of
        // the signed TMX token. Accept it only when it already exists in this
        // project; never persist an arbitrary src value as a visitor identity.
        if (!attributedVisitorId && event.trackingSrc) {
          const [knownVisitor] = await sql<{ visitor_id: string }[]>`
            SELECT visitor_id FROM tracking_visitors
            WHERE project_id=${connection.project_id} AND visitor_id=${event.trackingSrc}
            LIMIT 1
          `;
          attributedVisitorId = knownVisitor?.visitor_id ?? null;
        }
        // If Vendepay omitted src, recover the visitor from identity data the
        // lead previously supplied to tmx.identify()/checkout. This is an exact
        // email/phone match scoped to the same offer, never a proximity guess.
        if (!attributedVisitorId && (event.buyer.email || event.buyer.phone)) {
          const [identityMatch] = await sql<{ visitor_id: string }[]>`
            SELECT e.visitor_id FROM tracking_events e
            WHERE e.project_id=${connection.project_id}
              AND e.received_at >= ${event.occurredAt}::timestamptz - interval '30 days'
              AND e.received_at <= ${event.occurredAt}::timestamptz + interval '1 day'
              AND (
                (${event.buyer.email ?? null}::text IS NOT NULL
                  AND lower(e.properties->>'email')=lower(${event.buyer.email ?? null}::text))
                OR
                (${event.buyer.phone ?? null}::text IS NOT NULL
                  AND regexp_replace(e.properties->>'phone','\\D','','g')=
                      regexp_replace(${event.buyer.phone ?? null}::text,'\\D','','g'))
              )
            ORDER BY abs(extract(epoch FROM (${event.occurredAt}::timestamptz-e.received_at)))
            LIMIT 1
          `;
          attributedVisitorId = identityMatch?.visitor_id ?? null;
        }
        const [visitorSource] = attributedVisitorId
          ? await sql<
              Array<{ first_source: Record<string, string>; last_source: Record<string, string> }>
            >`
              SELECT first_source, last_source FROM tracking_visitors
              WHERE project_id=${connection.project_id} AND visitor_id=${attributedVisitorId}
              LIMIT 1
            `
          : [];
        const resolvedAttributionSource = {
          ...(visitorSource?.first_source ?? {}),
          ...(visitorSource?.last_source ?? {}),
          ...event.source,
        };
        const [productKind] = event.product.id
          ? await sql<{ kind: string }[]>`
              SELECT kind FROM tracking_product_kinds
              WHERE project_id = ${connection.project_id} AND product_id = ${event.product.id}
            `
          : [];
        const orderKind = productKind?.kind ?? 'unknown';
        // BRL figures were computed before the transaction (see above) — the
        // rate lookup may make a network call and shouldn't hold a tx open.
        const amountBrlMinor = ingestBrlMinor;
        const exchangeRate = ingestExchangeRate;
        const convertedAt = ingestConvertedAt;
        const [order] = await sql<{ id: string; status: string; order_kind: string }[]>`
          INSERT INTO tracking_orders
            (id, project_id, provider, external_id, status, amount_minor, currency,
             amount_brl_minor, exchange_rate, converted_at,
             visitor_id, buyer, raw_status, occurred_at, paid_at, payment_method,
             product, attribution_source, order_kind, cancelled_at)
          VALUES
            (${ulid()}, ${connection.project_id}, 'vendepay', ${event.transactionId},
             ${event.status}, ${event.amountMinor ?? null}, ${event.currency ?? null},
             ${amountBrlMinor}, ${exchangeRate}, ${convertedAt},
             ${attributedVisitorId ?? null}, ${sql.json(event.buyer)}, ${event.rawStatus ?? null},
             ${event.occurredAt}, ${event.status === 'paid' ? event.occurredAt : null},
             ${event.paymentMethod ?? null}, ${sql.json(event.product)}, ${sql.json(resolvedAttributionSource)},
             ${orderKind}, ${event.status === 'cancelled' ? event.occurredAt : null})
          ON CONFLICT (project_id, provider, external_id) DO UPDATE SET
            status = CASE
              WHEN tracking_orders.status IN ('refunded', 'chargeback') THEN tracking_orders.status
              WHEN tracking_orders.status = 'paid' AND EXCLUDED.status IN ('pending', 'refused', 'unknown')
                THEN tracking_orders.status
              WHEN tracking_orders.status IN ('cancelled', 'refused') AND EXCLUDED.status IN ('pending', 'unknown')
                THEN tracking_orders.status
              ELSE EXCLUDED.status
            END,
            amount_minor = COALESCE(EXCLUDED.amount_minor, tracking_orders.amount_minor),
            currency = COALESCE(EXCLUDED.currency, tracking_orders.currency),
            amount_brl_minor = COALESCE(EXCLUDED.amount_brl_minor, tracking_orders.amount_brl_minor),
            exchange_rate = COALESCE(EXCLUDED.exchange_rate, tracking_orders.exchange_rate),
            converted_at = COALESCE(EXCLUDED.converted_at, tracking_orders.converted_at),
            visitor_id = COALESCE(EXCLUDED.visitor_id, tracking_orders.visitor_id),
            buyer = tracking_orders.buyer || EXCLUDED.buyer,
            raw_status = COALESCE(EXCLUDED.raw_status, tracking_orders.raw_status),
            payment_method = COALESCE(EXCLUDED.payment_method, tracking_orders.payment_method),
            product = tracking_orders.product || EXCLUDED.product,
            attribution_source = tracking_orders.attribution_source || EXCLUDED.attribution_source,
            occurred_at = LEAST(tracking_orders.occurred_at, EXCLUDED.occurred_at),
            paid_at = CASE
              WHEN EXCLUDED.status = 'paid' THEN COALESCE(tracking_orders.paid_at, EXCLUDED.paid_at)
              ELSE tracking_orders.paid_at
            END,
            cancelled_at = CASE
              WHEN EXCLUDED.status = 'cancelled'
                THEN COALESCE(tracking_orders.cancelled_at, EXCLUDED.cancelled_at, now())
              ELSE tracking_orders.cancelled_at
            END,
            -- A mapping added after the order first arrived should still "heal" it on the
            -- next webhook (e.g. pending -> paid); never downgrade an already-known kind.
            order_kind = CASE
              WHEN EXCLUDED.order_kind <> 'unknown' THEN EXCLUDED.order_kind
              ELSE tracking_orders.order_kind
            END,
            updated_at = now()
          RETURNING id, status, order_kind
        `;
        if (!order) {
          return { inserted: true, deliveryIds: [], utmifyDeliveryIds: [], pushcutDeliveryIds: [] };
        }
        await sql`
          UPDATE webhook_receipts
          SET order_id = ${order.id}, processed_at = now()
          WHERE id = ${receiptId}
        `;
        if (order.status === 'paid') {
          await sql`
            UPDATE recovery_opportunities ro SET status='recovered',recovered_order_id=${order.id},
              recovered_at=COALESCE(recovered_at,now()),updated_at=now()
            WHERE ro.project_id=${connection.project_id} AND ro.status <> 'recovered'
              AND (
                ro.order_id=${order.id}
                OR (${event.buyer.email ?? null}::text IS NOT NULL AND lower(ro.email)=lower(${event.buyer.email ?? null}::text))
                OR (${event.buyer.phone ?? null}::text IS NOT NULL AND regexp_replace(ro.phone,'\\D','','g')=regexp_replace(${event.buyer.phone ?? null}::text,'\\D','','g'))
              )
          `;
          await sql`
            UPDATE recovery_messages rm SET state='cancelled'
            FROM recovery_opportunities ro
            WHERE rm.opportunity_id=ro.id AND ro.project_id=${connection.project_id}
              AND ro.status='recovered' AND rm.state='pending'
          `;
        }
        const utmify = await sql<{ id: string }[]>`
          SELECT id FROM tracking_utmify_destinations
          WHERE project_id = ${connection.project_id} AND enabled = true
        `;
        const utmifyDeliveryIds: string[] = [];
        for (const destination of utmify) {
          const id = ulid();
          const rows = await sql<{ id: string }[]>`
            INSERT INTO tracking_delivery_outbox
              (id, project_id, destination_kind, destination_id, order_id, event_id, event_type,
               state, last_error)
            VALUES
              (${id}, ${connection.project_id}, 'utmify', ${destination.id}, ${order.id},
               ${`vendepay:${event.transactionId}:${event.status}`}, ${`order.${event.status}`},
               ${skipsUtmify ? 'skipped' : 'pending'},
               ${
                 skipsUtmify
                   ? 'Cancelamento/abandono não é aceito pela UTMify; evento mantido apenas no TMX.'
                   : null
               })
            ON CONFLICT (destination_kind, destination_id, event_id) DO NOTHING
            RETURNING id
          `;
          if (rows[0] && !skipsUtmify) utmifyDeliveryIds.push(rows[0].id);
        }
        if (order.status !== 'paid') {
          return { inserted: true, deliveryIds: [], utmifyDeliveryIds, pushcutDeliveryIds: [] };
        }
        // Pushcut notifies on every paid order regardless of kind — front and
        // upsell both matter to "did a sale just happen", unlike Meta CAPI
        // (below) which only wants front to keep campaign CPA honest.
        const pushcutDestinations = await sql<
          Array<{
            id: string;
            front_notification_name: string;
            upsell_notification_name: string | null;
          }>
        >`
          SELECT id, front_notification_name, upsell_notification_name
          FROM tracking_pushcut_destinations
          WHERE project_id = ${connection.project_id} AND enabled = true
        `;
        const pushcutDeliveryIds: string[] = [];
        for (const destination of pushcutDestinations) {
          const notificationName =
            order.order_kind === 'upsell' || order.order_kind === 'upsell_2'
              ? destination.upsell_notification_name
              : destination.front_notification_name;
          // Destination opted out of upsell alerts (upsell_notification_name
          // is null) — nothing to enqueue for it on an upsell order.
          if (!notificationName) continue;
          const id = ulid();
          const rows = await sql<{ id: string }[]>`
            INSERT INTO tracking_delivery_outbox
              (id, project_id, destination_kind, destination_id, order_id, event_id, event_type,
               funnel_name)
            VALUES
              (${id}, ${connection.project_id}, 'pushcut', ${destination.id}, ${order.id},
               ${`vendepay:${event.transactionId}:${event.status}`}, ${`order.${order.order_kind}`},
               ${funnelName})
            ON CONFLICT (destination_kind, destination_id, event_id) DO NOTHING
            RETURNING id
          `;
          if (rows[0]) pushcutDeliveryIds.push(rows[0].id);
        }
        // Every approved transaction is a real Purchase. Front, upsell 1 and
        // upsell 2 use distinct transaction/event IDs, so Meta can deduplicate
        // retries without suppressing legitimate incremental revenue.
        const [rules] = await sql<
          Array<{ attributed_only: boolean; minimum_amount_minor: number }>
        >`
          SELECT attributed_only, minimum_amount_minor
          FROM tracking_meta_rules WHERE project_id = ${connection.project_id}
        `;
        if (
          (rules?.attributed_only && !event.trackingSrc) ||
          (rules && (event.amountMinor ?? 0) < rules.minimum_amount_minor)
        ) {
          return { inserted: true, deliveryIds: [], utmifyDeliveryIds, pushcutDeliveryIds };
        }
        const pixels = await sql<{ id: string }[]>`
          SELECT id FROM meta_pixels
          WHERE project_id = ${connection.project_id} AND enabled = true
        `;
        const deliveryIds: string[] = [];
        for (const pixel of pixels) {
          const deliveryId = ulid();
          const deliveries = await sql<{ id: string }[]>`
            INSERT INTO meta_deliveries
              (id, project_id, pixel_id, order_id, event_id)
            VALUES
              (${deliveryId}, ${connection.project_id}, ${pixel.id}, ${order.id},
               ${`vendepay:${event.transactionId}:purchase`})
            ON CONFLICT (pixel_id, event_id) DO NOTHING
            RETURNING id
          `;
          if (deliveries[0]) deliveryIds.push(deliveries[0].id);
        }
        return { inserted: true, deliveryIds, utmifyDeliveryIds, pushcutDeliveryIds };
      });
      await Promise.allSettled(
        outcome.deliveryIds.map((deliveryId) => app.metaQueue.add('send', { deliveryId })),
      );
      await Promise.allSettled(
        outcome.utmifyDeliveryIds.map((deliveryId) =>
          app.utmifyDeliveryQueue.add('send', { deliveryId }),
        ),
      );
      await Promise.allSettled(
        outcome.pushcutDeliveryIds.map((deliveryId) =>
          app.pushcutQueue.add('send', { deliveryId }),
        ),
      );
      return reply.code(outcome.inserted ? 202 : 200).send({
        accepted: true,
        receipt_id: receiptId,
        meta_deliveries: outcome.deliveryIds.length,
        utmify_deliveries: outcome.utmifyDeliveryIds.length,
        pushcut_deliveries: outcome.pushcutDeliveryIds.length,
        ...(!outcome.inserted ? { duplicate: true } : {}),
      });
    },
  );

  app.post<{ Querystring: { token?: string } }>(
    '/webhooks/vendepay/replay-quarantine',
    { bodyLimit: 1024, logLevel: 'silent' },
    async (req, reply) => {
      if (!app.db || !req.query.token) return reply.code(404).send({ accepted: false });
      const candidate = tokenHash(req.query.token);
      const [connection] = await app.db<Array<{ id: string }>>`
        SELECT id
        FROM vendepay_connections
        WHERE token_hash = ${candidate} AND enabled = true
        LIMIT 1
      `;
      if (!connection) return reply.code(404).send({ accepted: false });

      const receipts = await app.db<Array<{ id: string; payload: unknown }>>`
        SELECT id, payload
        FROM webhook_receipts
        WHERE connection_id = ${connection.id}
          AND state = 'quarantined'
        ORDER BY received_at ASC
        LIMIT 500
      `;
      let replayed = 0;
      let stillQuarantined = 0;
      let failed = 0;
      for (const receipt of receipts) {
        if (normalizeVendepay(receipt.payload).kind !== 'processable') {
          stillQuarantined += 1;
          continue;
        }
        const response = await app.inject({
          method: 'POST',
          url: `/v1/webhooks/vendepay?token=${encodeURIComponent(req.query.token)}`,
          payload: receipt.payload as Record<string, unknown>,
        });
        if (response.statusCode >= 200 && response.statusCode < 300) replayed += 1;
        else failed += 1;
      }
      return reply.send({
        accepted: true,
        inspected: receipts.length,
        replayed,
        still_quarantined: stillQuarantined,
        failed,
      });
    },
  );
};

export default plugin;
