import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { encryptSecret } from '../lib/secret-box.js';
import {
  isDefinitelyInvalidMetaToken,
  metaCredentialDetail,
  readMetaGraphError,
} from '../services/meta-credentials.js';

const PixelSchema = z.object({
  name: z.string().trim().min(1).max(80),
  pixel_id: z.string().regex(/^\d{5,32}$/),
  access_token: z.string().min(20).max(4096),
  test_event_code: z.string().trim().max(128).optional(),
});

const plugin: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get<{ Params: { id: string } }>('/offers/:id/tracking/meta-pixels', async (req, reply) => {
    await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
    if (!app.db) return reply.code(503).send({ pixels: [] });
    const pixels = await app.db`
      SELECT mp.id, mp.name, mp.pixel_id, mp.test_event_code, mp.enabled, mp.created_at
      FROM meta_pixels mp
      JOIN tracking_projects tp ON tp.id = mp.project_id
      WHERE tp.offer_id = ${req.params.id}
      ORDER BY mp.created_at DESC
    `;
    return reply.send({ pixels });
  });

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

    const [pixel] = await app.db`
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
    return reply.code(201).send({
      pixel,
      verification: verification.ok ? 'verified' : 'pending_event_test',
      ...(verificationWarning ? { verification_warning: verificationWarning } : {}),
    });
  });

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
             md.response, md.created_at, md.delivered_at,
             mp.name AS pixel_name, mp.pixel_id,
             o.external_id AS transaction_id
      FROM meta_deliveries md
      JOIN tracking_projects tp ON tp.id = md.project_id
      JOIN meta_pixels mp ON mp.id = md.pixel_id
      JOIN tracking_orders o ON o.id = md.order_id
      WHERE tp.offer_id = ${req.params.id}
      ORDER BY md.created_at DESC
      LIMIT 100
    `;
      return reply.send({ deliveries });
    },
  );

  app.post<{ Params: { id: string; deliveryId: string } }>(
    '/offers/:id/tracking/meta-deliveries/:deliveryId/retry',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send();
      const updated = await app.db<{ id: string }[]>`
        UPDATE meta_deliveries md SET state = 'pending', last_error = NULL
        FROM tracking_projects tp
        WHERE md.id = ${req.params.deliveryId}
          AND md.project_id = tp.id
          AND tp.offer_id = ${req.params.id}
          AND md.state <> 'delivered'
        RETURNING md.id
      `;
      if (!updated[0]) return reply.code(404).send({ error: 'delivery_not_found' });
      await app.metaQueue.add('send', { deliveryId: updated[0].id });
      return reply.code(202).send({ accepted: true });
    },
  );
};

export default plugin;
