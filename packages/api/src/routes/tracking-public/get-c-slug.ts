import { createHash } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { collectNetworkIdentifiers } from '../../lib/network-detection.js';
import { createTrackingToken } from '../../lib/tracking-token.js';
import { extractAttributionQuery } from './attribution.js';
import { cookieValue, requestCountry } from './browser-request.js';
import type { EntryRedirectRequest } from './request-schemas.js';

export function registerGetCSlugRoutes(app: FastifyInstance) {
  app.get('/c/:slug', async (req: EntryRedirectRequest, reply: FastifyReply) => {
    if (!app.db) return reply.code(503).send({ error: 'tracking_unavailable' });
    const [link] = await app.db<
      Array<{
        id: string;
        project_id: string;
        destination_url: string;
        traffic_source: string;
        ab_test_id: string | null;
        enabled: boolean;
      }>
    >`
      SELECT id, project_id, destination_url, traffic_source, ab_test_id, enabled
      FROM tracking_entry_links
      WHERE slug=${req.params.slug}
      LIMIT 1
    `;
    if (!link?.enabled) return reply.code(404).send({ error: 'entry_link_inactive' });
    const visitorId = cookieValue(req.headers.cookie, '_tmx_entry_v') || ulid();
    const journeyId = ulid();
    const previewRequest = req.query.tmx_preview === '1';
    const previewVariant = previewRequest ? req.query.tmx_variant?.trim().toLowerCase() : undefined;
    let destinationUrl = link.destination_url;
    let entryVariant: { id: string; label: string } | null = null;
    if (link.ab_test_id) {
      const [test] = await app.db<
        Array<{ id: string; traffic_a: number; winner_variant_id: string | null }>
      >`
        SELECT id, traffic_a, winner_variant_id
        FROM tracking_ab_tests
        WHERE id = ${link.ab_test_id} AND project_id = ${link.project_id}
          AND status = 'active' AND deleted_at IS NULL
        LIMIT 1
      `;
      if (test) {
        const variants = await app.db<
          Array<{ id: string; label: string; destination_url: string; position: number }>
        >`
          SELECT id, label, destination_url, position
          FROM tracking_ab_variants
          WHERE test_id = ${test.id} AND destination_url IS NOT NULL
          ORDER BY position
        `;
        if (variants.length === 2) {
          const [existing] = await app.db<{ variant_id: string }[]>`
            SELECT variant_id FROM tracking_ab_assignments
            WHERE test_id = ${test.id} AND visitor_id = ${visitorId}
          `;
          const bucket =
            createHash('sha256').update(`${test.id}|${visitorId}`).digest().readUInt32BE(0) % 100;
          const forcedPreviewVariant = previewVariant
            ? variants.find((variant) => variant.label.trim().toLowerCase() === previewVariant)
            : undefined;
          const selectedId =
            forcedPreviewVariant?.id ??
            test.winner_variant_id ??
            existing?.variant_id ??
            (bucket < test.traffic_a ? variants[0]!.id : variants[1]!.id);
          const selected = variants.find((variant) => variant.id === selectedId) ?? variants[0]!;
          if (!previewRequest) {
            await app.db`
              INSERT INTO tracking_ab_assignments(id, test_id, variant_id, visitor_id)
              VALUES (${ulid()}, ${test.id}, ${selected.id}, ${visitorId})
              ON CONFLICT(test_id, visitor_id) DO NOTHING
            `;
          }
          destinationUrl = selected.destination_url;
          entryVariant = { id: selected.id, label: selected.label };
        }
      }
    }
    const destination = new URL(destinationUrl);
    for (const [key, value] of Object.entries(req.query)) {
      if (!value || key === 'tmx_preview' || key === 'tmx_variant') continue;
      destination.searchParams.set(key, value);
    }
    const source = extractAttributionQuery(req.query);
    // A manually selected source classifies the entry link even when an ad
    // platform supplies no UTM. Explicit query UTMs still win, so agencies can
    // retain their existing campaign naming without data loss.
    const linkSource = link.traffic_source !== 'unknown' ? link.traffic_source : undefined;
    const country = requestCountry(req.headers);
    const userAgent = req.headers['user-agent'] ?? '';
    const entrySource = {
      ...source,
      ...(linkSource
        ? {
            tmx_traffic_source: linkSource,
            ...(source.utm_source ? {} : { utm_source: linkSource }),
          }
        : {}),
      ...(country ? { country } : {}),
    };
    const clickIds = collectNetworkIdentifiers(entrySource);
    const previewOrBot =
      previewRequest ||
      /facebookexternalhit|facebot|meta-externalagent|meta-externalfetcher|bot|crawler|spider|preview/i.test(
        userAgent,
      );
    if (!previewOrBot) {
      await app.db`
        INSERT INTO tracking_events
          (id, project_id, visitor_id, journey_id, event_name, event_category,
           event_url, source, click_ids, properties, client_ip, user_agent, received_at)
        VALUES
          (${ulid()}, ${link.project_id}, ${visitorId}, ${journeyId}, 'AdClick', 'acquisition',
           ${`${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/c/${req.params.slug}`},
           ${app.db.json(entrySource as never)}, ${app.db.json(clickIds)},
           ${app.db.json({
             entry_link_id: link.id,
             ...(linkSource ? { traffic_source: linkSource } : {}),
             ...(link.ab_test_id ? { ab_test_id: link.ab_test_id } : {}),
             ...(entryVariant
               ? { ab_variant_id: entryVariant.id, ab_variant_label: entryVariant.label }
               : {}),
           } as never)},
           ${req.ip}, ${userAgent || null}, now())
      `;
      await app.db`
        INSERT INTO tracking_visitors
          (project_id, visitor_id, first_source, last_source, click_ids)
        VALUES
          (${link.project_id}, ${visitorId}, ${app.db.json(entrySource as never)},
           ${app.db.json(entrySource as never)}, ${app.db.json(clickIds)})
        ON CONFLICT (project_id, visitor_id) DO UPDATE SET
          last_source = tracking_visitors.last_source || EXCLUDED.last_source,
          click_ids = CASE
            WHEN tracking_visitors.click_ids = '{}'::jsonb THEN EXCLUDED.click_ids
            ELSE tracking_visitors.click_ids
          END,
          last_seen_at = now()
      `;
    }
    const trackingToken = createTrackingToken(
      { projectId: link.project_id, visitorId, journeyId },
      env.WEBHOOK_SECRET,
    );
    destination.searchParams.set('src', trackingToken);
    if (!previewRequest) {
      reply.header(
        'set-cookie',
        `_tmx_entry_v=${visitorId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`,
      );
    }
    return reply.redirect(destination.toString(), 302);
  });
}
