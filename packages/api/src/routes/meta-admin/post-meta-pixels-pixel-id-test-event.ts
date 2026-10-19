import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { decryptSecret } from '../../lib/secret-box.js';
import { metaCredentialDetail, readMetaGraphError } from '../../services/meta-credentials.js';
import { buildMetaTestEvent } from '../../services/meta-test-events.js';
import { TestEventCodeSchema, TestEventSchema } from './pixel-schema.js';

export function registerPostMetaPixelsPixelIdTestEventRoutes(app: FastifyInstance) {
  app.post<{ Params: { id: string; pixelId: string } }>(
    '/offers/:id/tracking/meta-pixels/:pixelId/test-event',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY) {
        return reply.code(503).send({ error: 'meta_configuration_unavailable' });
      }
      const parsed = TestEventSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_test_event' });
      const [pixel] = await app.db<
        Array<{
          pixel_id: string;
          access_token_encrypted: string;
          test_event_code: string | null;
        }>
      >`
        SELECT mp.pixel_id, mp.access_token_encrypted, mp.test_event_code
        FROM meta_pixels mp
        JOIN tracking_projects tp ON tp.id = mp.project_id
        WHERE mp.id = ${req.params.pixelId}
          AND tp.offer_id = ${req.params.id}
          AND mp.enabled = true
        LIMIT 1
      `;
      if (!pixel) return reply.code(404).send({ error: 'pixel_not_found' });
      if (!pixel.test_event_code) {
        return reply.code(409).send({
          error: 'test_event_code_required',
          detail: 'Adicione o Test Event Code ao Pixel antes de enviar eventos de teste.',
        });
      }
      const eventId = `tmx-test-${ulid()}`;
      const eventSourceUrl =
        typeof req.headers.origin === 'string' && /^https?:\/\//.test(req.headers.origin)
          ? `${req.headers.origin}/tracking`
          : `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/tracking-test`;
      const payload = {
        data: [
          buildMetaTestEvent({
            eventName: parsed.data.event_name,
            eventId,
            eventSourceUrl,
            externalId: `${req.params.id}:${req.user!.sub}:meta-test`,
            clientIp: req.ip,
            userAgent: req.headers['user-agent'],
          }),
        ],
        test_event_code: pixel.test_event_code,
        partner_agent: 'tmxhub-1.0',
      };
      const url = new URL(
        `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${pixel.pixel_id}/events`,
      );
      url.searchParams.set(
        'access_token',
        decryptSecret(pixel.access_token_encrypted, env.TRACKING_ENCRYPTION_KEY),
      );
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(15_000),
      });
      const result = (await response.json().catch(() => null)) as unknown;
      if (!response.ok) {
        const graphError = readMetaGraphError(result);
        return reply.code(422).send({
          error: 'meta_test_event_rejected',
          detail: metaCredentialDetail(response.status, graphError),
        });
      }
      const eventsReceived =
        result && typeof result === 'object' && 'events_received' in result
          ? Number((result as { events_received?: unknown }).events_received) || 0
          : 0;
      return reply.send({
        accepted: true,
        event_name: parsed.data.event_name,
        event_id: eventId,
        events_received: eventsReceived,
        detail:
          eventsReceived > 0
            ? 'Evento aceito pela Meta. Ele aparecerá em Eventos de Teste.'
            : 'A Meta respondeu sem erro, mas não confirmou events_received.',
      });
    },
  );

  app.patch<{ Params: { id: string; pixelId: string } }>(
    '/offers/:id/tracking/meta-pixels/:pixelId/test-event-code',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send({ error: 'database_unavailable' });
      const parsed = TestEventCodeSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({
          error: 'invalid_test_event_code',
          detail: 'Informe o Test Event Code exibido no Gerenciador de Eventos da Meta.',
        });
      }
      const [pixel] = await app.db<
        Array<{ id: string; pixel_id: string; test_event_code: string }>
      >`
        UPDATE meta_pixels mp
        SET test_event_code = ${parsed.data.test_event_code}
        FROM tracking_projects tp
        WHERE mp.id = ${req.params.pixelId}
          AND mp.project_id = tp.id
          AND tp.offer_id = ${req.params.id}
          AND mp.enabled = true
        RETURNING mp.id, mp.pixel_id, mp.test_event_code
      `;
      if (!pixel) return reply.code(404).send({ error: 'pixel_not_found' });
      return reply.send({ pixel });
    },
  );

  app.delete<{ Params: { id: string; pixelId: string } }>(
    '/offers/:id/tracking/meta-pixels/:pixelId',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send();
      await app.db`
        UPDATE meta_pixels mp SET enabled = false
        FROM tracking_projects tp
        WHERE mp.id = ${req.params.pixelId}
          AND mp.project_id = tp.id
          AND tp.offer_id = ${req.params.id}
      `;
      return reply.code(204).send();
    },
  );

  app.get<{ Params: { id: string } }>(
    '/offers/:id/tracking/meta-deliveries',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send({ deliveries: [] });
      const deliveries = await app.db`
      SELECT md.id, md.event_id, md.state, md.attempts, md.last_error,
             md.response, md.response_status,
             COALESCE(md.provider_event_count, (md.response->>'events_received')::integer, 0)
               AS provider_event_count,
             md.created_at, md.delivered_at,
             md.event_name,
             mp.name AS pixel_name, mp.pixel_id,
             COALESCE(o.external_id, 'TMX-IC-' || md.event_id) AS transaction_id,
             COALESCE(direct_event.event_url, latest_event.event_url) AS event_url,
             NULLIF(COALESCE(direct_event.source->>'campaign_id', o.attribution_source->>'campaign_id',
               tv.last_source->>'campaign_id', tv.first_source->>'campaign_id', latest_event.source->>'campaign_id'), '') AS campaign_id,
             NULLIF(COALESCE(direct_event.source->>'adset_id', o.attribution_source->>'adset_id',
               tv.last_source->>'adset_id', tv.first_source->>'adset_id', latest_event.source->>'adset_id'), '') AS adset_id,
             NULLIF(COALESCE(direct_event.source->>'ad_id', o.attribution_source->>'ad_id',
               tv.last_source->>'ad_id', tv.first_source->>'ad_id', latest_event.source->>'ad_id'), '') AS ad_id,
             NULLIF(COALESCE(direct_event.source->>'fbclid', o.attribution_source->>'fbclid',
               tv.last_source->>'fbclid', tv.first_source->>'fbclid', latest_event.source->>'fbclid'), '') IS NOT NULL AS has_fbclid,
             NULLIF(COALESCE(direct_event.source->>'_fbc', o.attribution_source->>'_fbc',
               tv.last_source->>'_fbc', tv.first_source->>'_fbc', latest_event.source->>'_fbc'), '') IS NOT NULL AS has_fbc,
             NULLIF(COALESCE(direct_event.source->>'_fbp', o.attribution_source->>'_fbp',
               tv.last_source->>'_fbp', tv.first_source->>'_fbp', latest_event.source->>'_fbp'), '') IS NOT NULL AS has_fbp
      FROM meta_deliveries md
      JOIN tracking_projects tp ON tp.id = md.project_id
      JOIN meta_pixels mp ON mp.id = md.pixel_id
      LEFT JOIN tracking_orders o ON o.id = md.order_id
      LEFT JOIN tracking_events direct_event
        ON direct_event.project_id = md.project_id
       AND direct_event.id = CASE WHEN o.attribution_locked_at IS NOT NULL
         THEN o.attribution_event_id ELSE md.event_id END
      LEFT JOIN tracking_visitors tv
        ON tv.project_id = md.project_id
       AND o.attribution_locked_at IS NULL
       AND tv.visitor_id = COALESCE(o.visitor_id, direct_event.visitor_id)
      LEFT JOIN LATERAL (
        SELECT te.event_url, te.source
        FROM tracking_events te
        WHERE te.project_id = md.project_id
          AND o.attribution_locked_at IS NULL
          AND te.visitor_id = COALESCE(o.visitor_id, direct_event.visitor_id)
          AND te.source <> '{}'::jsonb
        ORDER BY te.received_at DESC
        LIMIT 1
      ) latest_event ON true
      WHERE tp.offer_id = ${req.params.id}
      ORDER BY md.created_at DESC
      LIMIT 100
    `;
      return reply.send({ deliveries });
    },
  );
}
