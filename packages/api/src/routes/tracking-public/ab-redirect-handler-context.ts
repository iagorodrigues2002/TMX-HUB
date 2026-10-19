import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { createTrackingToken } from '../../lib/tracking-token.js';
import {
  enqueueInitiateCheckout,
  extractAttributionQuery,
  hasCampaignAttribution,
  readRotatingTrackingToken,
} from './attribution.js';
import {
  cookieValue,
  requestCountry,
  safeEventSourceUrl,
  validBrowserEventId,
} from './browser-request.js';
import type { AbRedirectRequest } from './request-schemas.js';

export function createAbRedirectHandlerContext(app: FastifyInstance) {
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
    const previewRequest = req.query.tmx_preview === '1';
    const previewVariant = previewRequest ? req.query.tmx_variant?.trim().toLowerCase() : undefined;
    if (previewRequest && !previewVariant) {
      return {
        active: true,
        test_id: test.id,
        traffic_a: test.traffic_a,
        winner_variant_id: test.winner_variant_id,
        variants,
      };
    }
    if (previewRequest && previewVariant) {
      const selected = variants.find(
        (variant) => variant.label.trim().toLowerCase() === previewVariant,
      );
      if (!selected?.destination_url) {
        return reply.code(404).send({ error: 'ab_preview_variant_not_found' });
      }
      const destination = new URL(selected.destination_url);
      for (const [key, value] of Object.entries(req.query)) {
        if (!value || key === 'tmx_preview' || key === 'tmx_variant') continue;
        if (!destination.searchParams.has(key)) destination.searchParams.set(key, value);
      }
      destination.searchParams.set('tmx_ab', selected.label);
      return reply.redirect(destination.toString(), 302);
    }
    const linked = req.query.src ? readRotatingTrackingToken(req.query.src, req) : null;
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
    // The Typebot button can be clicked while the landing PageView request is
    // still committing. Give that first-party touch a brief chance to become
    // visible before permanently emitting an unattributed checkout.
    if (userAgent && !hasCampaignAttribution(mergedRecentSource)) {
      await new Promise((resolve) => setTimeout(resolve, 350));
    }
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
  return { abRedirectHandler };
}
