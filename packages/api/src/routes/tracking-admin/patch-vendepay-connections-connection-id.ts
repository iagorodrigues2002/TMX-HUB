import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { normalizeVendepay } from '../../integrations/vendepay/normalize.js';
import { NotFoundError, zodToProblem } from '../../lib/problem.js';
import { encryptSecret } from '../../lib/secret-box.js';
import {
  type PaginationQuery,
  VendepayConnectionUpdateSchema,
  VendepaySigningSecretSchema,
  databaseUnavailable,
  pagination,
  parsePagination,
  parseTrackingDate,
  tokenHash,
  webhookUrl,
} from './pagination-schema.js';

export function registerPatchVendepayConnectionsConnectionIdRoutes(app: FastifyInstance) {
  app.patch<{ Params: { id: string; connectionId: string } }>(
    '/offers/:id/tracking/vendepay/connections/:connectionId',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const parsed = VendepayConnectionUpdateSchema.safeParse(req.body);
      if (!parsed.success) throw zodToProblem(parsed.error);
      const [connection] = await app.db`
        UPDATE vendepay_connections v
        SET name = COALESCE(${parsed.data.name ?? null}, v.name),
            enabled = COALESCE(${parsed.data.enabled ?? null}, v.enabled)
        FROM tracking_projects p
        WHERE v.project_id = p.id AND p.offer_id = ${req.params.id}
          AND v.id = ${req.params.connectionId}
        RETURNING v.id, v.name, v.enabled, v.propagation_param, v.created_at,
          (v.signing_secret_encrypted IS NOT NULL) AS signing_secret_configured
      `;
      if (!connection) throw new NotFoundError('Conta Vendepay não encontrada.');
      return reply.send({ connection });
    },
  );

  app.put<{ Params: { id: string; connectionId: string } }>(
    '/offers/:id/tracking/vendepay/connections/:connectionId/signing-secret',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY) {
        return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
      }
      const parsed = VendepaySigningSecretSchema.safeParse(req.body);
      if (!parsed.success) throw zodToProblem(parsed.error);
      const [updated] = await app.db<{ id: string; signing_secret_updated_at: Date }[]>`
        UPDATE vendepay_connections v
        SET signing_secret_encrypted =
              ${encryptSecret(parsed.data.signing_secret, env.TRACKING_ENCRYPTION_KEY)},
            signing_secret_updated_at = now()
        FROM tracking_projects p
        WHERE v.project_id = p.id AND p.offer_id = ${req.params.id}
          AND v.id = ${req.params.connectionId}
        RETURNING v.id, v.signing_secret_updated_at
      `;
      if (!updated) throw new NotFoundError('Conta Vendepay não encontrada.');
      return reply.send({ configured: true, updated_at: updated.signing_secret_updated_at });
    },
  );

  app.post<{ Params: { id: string; connectionId: string } }>(
    '/offers/:id/tracking/vendepay/connections/:connectionId/rotate-token',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const token = randomBytes(32).toString('base64url');
      const [updated] = await app.db<{ id: string }[]>`
        UPDATE vendepay_connections v
        SET token_hash = ${tokenHash(token)}
        FROM tracking_projects p
        WHERE v.project_id = p.id AND p.offer_id = ${req.params.id}
          AND v.id = ${req.params.connectionId}
        RETURNING v.id
      `;
      if (!updated) throw new NotFoundError('Conta Vendepay não encontrada.');
      return reply.send({
        vendepay_webhook_url: webhookUrl(token),
        warning: 'A URL anterior desta conta foi desativada. Copie a nova URL agora.',
      });
    },
  );

  app.put<{ Params: { id: string } }>(
    '/offers/:id/tracking/vendepay/signing-secret',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db || !env.TRACKING_ENCRYPTION_KEY) {
        return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
      }
      const parsed = VendepaySigningSecretSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: 'invalid_vendepay_signing_secret' });
      }
      const updated = await app.db<{ id: string; signing_secret_updated_at: Date }[]>`
        UPDATE vendepay_connections v
        SET
          signing_secret_encrypted =
            ${encryptSecret(parsed.data.signing_secret, env.TRACKING_ENCRYPTION_KEY)},
          signing_secret_updated_at = now()
        FROM tracking_projects p
        WHERE v.project_id = p.id AND p.offer_id = ${req.params.id}
          AND v.id = (
            SELECT vc.id FROM vendepay_connections vc
            WHERE vc.project_id = p.id ORDER BY vc.created_at ASC LIMIT 1
          )
        RETURNING v.id, v.signing_secret_updated_at
      `;
      if (!updated[0]) {
        throw new NotFoundError('O tracking Vendepay ainda não foi configurado para esta oferta.');
      }
      return reply.send({
        configured: true,
        updated_at: updated[0].signing_secret_updated_at,
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/vendepay/rotate-token',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);

      const token = randomBytes(32).toString('base64url');
      const updated = await app.db<{ id: string }[]>`
        UPDATE vendepay_connections v
        SET token_hash = ${tokenHash(token)}
        FROM tracking_projects p
        WHERE v.project_id = p.id AND p.offer_id = ${req.params.id}
          AND v.id = (
            SELECT vc.id FROM vendepay_connections vc
            WHERE vc.project_id = p.id ORDER BY vc.created_at ASC LIMIT 1
          )
        RETURNING v.id
      `;
      if (updated.length === 0) {
        const [project] = await app.db<{ id: string }[]>`
          SELECT id FROM tracking_projects WHERE offer_id = ${req.params.id} LIMIT 1
        `;
        if (!project) {
          throw new NotFoundError('O tracking ainda não foi configurado para esta oferta.');
        }
        await app.db`
          INSERT INTO vendepay_connections (id, project_id, token_hash)
          VALUES (${ulid()}, ${project.id}, ${tokenHash(token)})
        `;
      }
      return reply.send({
        vendepay_webhook_url: webhookUrl(token),
        warning:
          'A URL anterior deixou de funcionar. Esta nova URL é exibida apenas nesta rotação.',
      });
    },
  );

  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/vendepay/preview',
    async (req, reply) => {
      await app.offerStore.assertManager(req.params.id, req.user!.sub, req.user!.role === 'admin');
      const normalized = normalizeVendepay(req.body);
      if (normalized.kind === 'quarantined') {
        return reply.send({
          processable: false,
          diagnostics: normalized.diagnostics,
        });
      }
      return {
        processable: true,
        normalized: normalized.event,
      };
    },
  );

  app.get<{ Params: { id: string }; Querystring: { connection_id?: string } }>(
    '/offers/:id/tracking/vendepay/receipts',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send({ receipts: [] });
      const receipts = await app.db`
        SELECT r.id, r.state, r.diagnostics, r.received_at, r.processed_at,
               v.id AS connection_id, v.name AS connection_name,
               r.payload,
               o.external_id AS transaction_id, o.status AS order_status,
               o.amount_minor, o.currency, o.payment_method, o.product
        FROM webhook_receipts r
        JOIN vendepay_connections v ON v.id = r.connection_id
        JOIN tracking_projects p ON p.id = v.project_id
        LEFT JOIN tracking_orders o ON o.id = r.order_id
        WHERE p.offer_id = ${req.params.id}
          AND (${req.query.connection_id ?? null}::text IS NULL OR r.connection_id = ${req.query.connection_id ?? null})
        ORDER BY r.received_at DESC
        LIMIT 100
      `;
      return { receipts };
    },
  );

  app.get<{ Params: { id: string }; Querystring: PaginationQuery }>(
    '/offers/:id/tracking/events',
    async (req, reply) => {
      await app.offerStore.assertAccess(req.params.id, req.user!.sub, req.user!.role === 'admin');
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      const { page, per_page: perPage, offset } = parsePagination(req.query);
      const { date, from, to } = parseTrackingDate(req.query);

      const [items, totals] = await Promise.all([
        app.db<
          Array<{
            id: string;
            visitor_id: string;
            session_id: string | null;
            event_name: string;
            event_url: string;
            page_title: string | null;
            referrer: string | null;
            source: Record<string, string>;
            client_at: Date | null;
            received_at: Date;
          }>
        >`
          SELECT e.id, e.visitor_id, e.session_id, e.event_name, e.event_url, e.page_title,
                 e.referrer, e.source, e.client_at, e.received_at
          FROM tracking_events e
          JOIN tracking_projects p ON p.id = e.project_id
          WHERE p.offer_id = ${req.params.id}
            AND e.received_at >= ${from} AND e.received_at < ${to}
          ORDER BY e.received_at DESC, e.id DESC
          LIMIT ${perPage} OFFSET ${offset}
        `,
        app.db<{ total: number }[]>`
          SELECT count(*)::int AS total
          FROM tracking_events e
          JOIN tracking_projects p ON p.id = e.project_id
          WHERE p.offer_id = ${req.params.id}
            AND e.received_at >= ${from} AND e.received_at < ${to}
        `,
      ]);
      const total = totals[0]?.total ?? 0;
      return {
        date,
        time_zone: 'America/Sao_Paulo',
        items,
        pagination: pagination(page, perPage, total),
      };
    },
  );
}
