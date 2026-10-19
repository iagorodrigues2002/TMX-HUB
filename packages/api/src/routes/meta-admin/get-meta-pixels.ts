import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { decryptSecret, encryptSecret } from '../../lib/secret-box.js';
import {
  isDefinitelyInvalidMetaToken,
  metaCredentialDetail,
  readMetaGraphError,
} from '../../services/meta-credentials.js';
import { PixelProductsSchema, PixelSchema, PixelUpdateSchema } from './pixel-schema.js';

export function registerGetMetaPixelsRoutes(app: FastifyInstance) {
  app.get<{ Params: { id: string } }>('/offers/:id/tracking/meta-pixels', async (req, reply) => {
    await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send({ pixels: [] });
    const pixels = await app.db`
      SELECT mp.id, mp.name, mp.pixel_id, mp.test_event_code, mp.enabled, mp.created_at,
             COALESCE((SELECT json_agg(mpp.product_id ORDER BY mpp.product_id) FROM meta_pixel_products mpp WHERE mpp.pixel_id=mp.id),'[]'::json) AS product_ids
      FROM meta_pixels mp
      JOIN tracking_projects tp ON tp.id = mp.project_id
      WHERE tp.offer_id = ${req.params.id}
      ORDER BY mp.created_at DESC
    `;
    return reply.send({ pixels });
  });

  app.put<{ Params: { id: string; pixelId: string } }>(
    '/offers/:id/tracking/meta-pixels/:pixelId/products',
    async (req, reply) => {
      await app.offerStore.assertTrackingManager(
        req.params.id,
        req.user!.sub,
        req.user!.role === 'admin',
      );
      if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
      const parsed = PixelProductsSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_products' });
      const [pixel] = await app.db<
        { id: string }[]
      >`SELECT mp.id FROM meta_pixels mp JOIN tracking_projects p ON p.id=mp.project_id WHERE mp.id=${req.params.pixelId} AND p.offer_id=${req.params.id}`;
      if (!pixel) return reply.code(404).send({ error: 'pixel_not_found' });
      await app.db.begin(async (sql) => {
        await sql`DELETE FROM meta_pixel_products WHERE pixel_id=${pixel.id}`;
        for (const productId of [...new Set(parsed.data.product_ids)])
          await sql`INSERT INTO meta_pixel_products(pixel_id,product_id) VALUES(${pixel.id},${productId})`;
      });
      return { product_ids: [...new Set(parsed.data.product_ids)] };
    },
  );

  app.post<{ Params: { id: string } }>('/offers/:id/tracking/meta-pixels', async (req, reply) => {
    await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db || !env.TRACKING_ENCRYPTION_KEY) {
      return reply.code(503).send({
        error: 'meta_configuration_unavailable',
        detail: 'Configure DATABASE_URL e TRACKING_ENCRYPTION_KEY.',
      });
    }
    const parsed = PixelSchema.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid_pixel' });
    const [project] = await app.db<{ id: string }[]>`
      SELECT id FROM tracking_projects WHERE offer_id = ${req.params.id} AND enabled = true
    `;
    if (!project) return reply.code(409).send({ error: 'tracking_not_configured' });

    const checkUrl = new URL(
      `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${parsed.data.pixel_id}`,
    );
    checkUrl.searchParams.set('fields', 'id,name');
    checkUrl.searchParams.set('access_token', parsed.data.access_token);
    const verification = await fetch(checkUrl, { signal: AbortSignal.timeout(10_000) });
    const verificationPayload = (await verification.json().catch(() => null)) as unknown;
    const verificationError = readMetaGraphError(verificationPayload);
    if (!verification.ok && isDefinitelyInvalidMetaToken(verificationError)) {
      return reply.code(422).send({
        error: 'meta_credentials_rejected',
        detail: metaCredentialDetail(verification.status, verificationError),
      });
    }
    const verificationWarning = !verification.ok
      ? 'O token CAPI foi salvo, mas não possui permissão para consultar o Pixel via GET. Isso é comum em tokens gerados pelo Events Manager; valide-o enviando um evento com Test Event Code.'
      : null;

    const [pixel] = await app.db<
      {
        id: string;
        name: string;
        pixel_id: string;
        test_event_code: string | null;
        enabled: boolean;
        created_at: Date;
      }[]
    >`
      INSERT INTO meta_pixels
        (id, project_id, name, pixel_id, access_token_encrypted, test_event_code)
      VALUES
        (${ulid()}, ${project.id}, ${parsed.data.name}, ${parsed.data.pixel_id},
         ${encryptSecret(parsed.data.access_token, env.TRACKING_ENCRYPTION_KEY)},
         ${parsed.data.test_event_code ?? null})
      ON CONFLICT (project_id, pixel_id) DO UPDATE SET
        name = EXCLUDED.name,
        access_token_encrypted = EXCLUDED.access_token_encrypted,
        test_event_code = EXCLUDED.test_event_code,
        enabled = true
      RETURNING id, name, pixel_id, test_event_code, enabled, created_at
    `;
    if (!pixel) return reply.code(500).send({ error: 'meta_pixel_not_saved' });
    const backfill = await app.db.begin(async (sql) => {
      const purchases = await sql<{ id: string }[]>`
        INSERT INTO meta_deliveries
          (id, project_id, pixel_id, order_id, event_id, event_name, event_at)
        SELECT md5(${pixel.id} || ':' || o.id || ':pixel-backfill-purchase'),
               ${project.id}, ${pixel.id}, o.id,
               'vendepay:' || o.external_id || ':purchase', 'Purchase',
               COALESCE(o.paid_at, o.occurred_at)
        FROM tracking_orders o
        LEFT JOIN tracking_meta_rules rules ON rules.project_id=o.project_id
        WHERE o.project_id=${project.id}
          AND o.status='paid'
          AND COALESCE(o.paid_at, o.occurred_at) >= now() - interval '6 days 23 hours'
          AND (rules.attributed_only IS NOT TRUE OR NULLIF(o.attribution_source->>'src', '') IS NOT NULL)
          AND (rules.minimum_amount_minor IS NULL OR COALESCE(o.amount_minor, 0) >= rules.minimum_amount_minor)
        ON CONFLICT (pixel_id, event_id) DO NOTHING
        RETURNING id
      `;
      const checkouts = await sql<{ id: string }[]>`
        INSERT INTO meta_deliveries
          (id, project_id, pixel_id, order_id, event_id, event_name, event_at)
        SELECT md5(${pixel.id} || ':' || e.id || ':pixel-backfill-ic'),
               ${project.id}, ${pixel.id}, NULL, e.id, 'InitiateCheckout', e.received_at
        FROM tracking_events e
        WHERE e.project_id=${project.id}
          AND e.event_name='InitiateCheckout'
          AND e.received_at >= now() - interval '6 days 23 hours'
        ON CONFLICT (pixel_id, event_id) DO NOTHING
        RETURNING id
      `;
      return [...purchases, ...checkouts];
    });
    await Promise.allSettled(
      backfill.map(({ id }) =>
        app.metaQueue.add('send', { deliveryId: id }, { jobId: `${id}-pixel-backfill` }),
      ),
    );
    return reply.code(201).send({
      pixel,
      backfill_queued: backfill.length,
      verification: verification.ok ? 'verified' : 'pending_event_test',
      ...(verificationWarning ? { verification_warning: verificationWarning } : {}),
    });
  });

  app.patch<{ Params: { id: string; pixelId: string } }>(
    '/offers/:id/tracking/meta-pixels/:pixelId',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY) {
        return reply.code(503).send({ error: 'meta_configuration_unavailable' });
      }
      const parsed = PixelUpdateSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(400).send({ error: 'invalid_pixel' });
      const [current] = await app.db<
        Array<{
          id: string;
          pixel_id: string;
          access_token_encrypted: string;
        }>
      >`
        SELECT mp.id,mp.pixel_id,mp.access_token_encrypted
        FROM meta_pixels mp
        JOIN tracking_projects tp ON tp.id=mp.project_id
        WHERE mp.id=${req.params.pixelId} AND tp.offer_id=${req.params.id} AND mp.enabled=true
        LIMIT 1
      `;
      if (!current) return reply.code(404).send({ error: 'pixel_not_found' });
      const token =
        parsed.data.access_token ??
        decryptSecret(current.access_token_encrypted, env.TRACKING_ENCRYPTION_KEY);
      if (parsed.data.access_token || parsed.data.pixel_id !== current.pixel_id) {
        const checkUrl = new URL(
          `https://graph.facebook.com/${env.META_GRAPH_API_VERSION}/${parsed.data.pixel_id}`,
        );
        checkUrl.searchParams.set('fields', 'id,name');
        checkUrl.searchParams.set('access_token', token);
        const verification = await fetch(checkUrl, { signal: AbortSignal.timeout(10_000) });
        const payload = (await verification.json().catch(() => null)) as unknown;
        const graphError = readMetaGraphError(payload);
        if (!verification.ok && isDefinitelyInvalidMetaToken(graphError)) {
          return reply.code(422).send({
            error: 'meta_credentials_rejected',
            detail: metaCredentialDetail(verification.status, graphError),
          });
        }
      }
      const [pixel] = await app.db`
        UPDATE meta_pixels mp SET
          name=${parsed.data.name},
          pixel_id=${parsed.data.pixel_id},
          access_token_encrypted=${encryptSecret(token, env.TRACKING_ENCRYPTION_KEY)},
          test_event_code=${parsed.data.test_event_code ?? null}
        FROM tracking_projects tp
        WHERE mp.id=${current.id} AND mp.project_id=tp.id AND tp.offer_id=${req.params.id}
        RETURNING mp.id,mp.name,mp.pixel_id,mp.test_event_code,mp.enabled,mp.created_at
      `;
      return reply.send({ pixel });
    },
  );
}
