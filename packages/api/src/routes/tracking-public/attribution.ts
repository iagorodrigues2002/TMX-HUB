import type { FastifyInstance, FastifyRequest } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { readTrackingTokenWithRotation } from '../../lib/tracking-token.js';

export const attributionQueryKeys = new Set([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'utm_id',
  'vtid',
  'sid',
  'sck',
  'subid',
  'xcod',
  ...Array.from({ length: 20 }, (_, index) => `sub${index + 1}`),
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
  'ttclid',
  'twclid',
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
  '_ttp',
  'fbc',
  'fbp',
  'ttp',
  '_fbclid_ts',
]);

export function extractAttributionQuery(query: Record<string, string | undefined>) {
  return Object.fromEntries(
    Object.entries(query).filter(([key, value]) => Boolean(value) && attributionQueryKeys.has(key)),
  ) as Record<string, string>;
}

export const campaignAttributionKeys = [
  'campaign_id',
  'campaign_name',
  'utm_campaign',
  'adset_id',
  'ad_id',
] as const;

export function hasCampaignAttribution(source: Record<string, string>) {
  return campaignAttributionKeys.some((key) => Boolean(source[key]?.trim()));
}

export async function enqueueInitiateCheckout(
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
    const globalPixels = await sql<{ external_pixel_id: string }[]>`
      SELECT d.external_pixel_id
      FROM tracking_utmify_destinations d
      WHERE d.scope='global' AND d.enabled=true AND d.external_pixel_id IS NOT NULL
        AND COALESCE((
          SELECT r.enabled FROM tracking_utmify_global_offer_routes r
          WHERE r.project_id=${input.projectId}
        ),true)=true
    `;
    const utmify: Array<{ id: string }> = [];
    const utmifyPixelIds = [
      ...new Set([
        ...(project?.utmify_pixel_id ? [project.utmify_pixel_id] : []),
        ...globalPixels.map((item) => item.external_pixel_id),
      ]),
    ];
    for (const externalPixelId of utmifyPixelIds) {
      const webEvents = await sql<{ id: string }[]>`
        INSERT INTO tracking_utmify_web_events
          (id, project_id, pixel_id, external_pixel_id, event_id, event_name)
        VALUES
          (${ulid()}, ${input.projectId}, NULL, ${externalPixelId},
           ${input.eventId}, 'InitiateCheckout')
        ON CONFLICT (project_id, external_pixel_id, event_id) DO NOTHING
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

export function readRotatingTrackingToken(
  token: string,
  request: FastifyRequest,
): NonNullable<ReturnType<typeof readTrackingTokenWithRotation>>['payload'] | null {
  const result = readTrackingTokenWithRotation(token, env.WEBHOOK_SECRET, env.WEBHOOK_SECRET_PREV);
  if (result?.matched === 'previous') {
    request.server.log.warn('Signed tracking token accepted with previous webhook secret');
  }
  return result?.payload ?? null;
}
