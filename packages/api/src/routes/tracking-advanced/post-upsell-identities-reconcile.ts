import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../../env.js';
import { normalizeVendepay } from '../../integrations/vendepay/normalize.js';
import { encryptSecret } from '../../lib/secret-box.js';
import { checkUpsellCompatibility } from '../../services/upsell-compatibility.js';
import { collectVendaIdCandidates } from '../../services/vendepay-venda-id.js';
import type { createCnameTargetContext } from './cname-target-context.js';
import {
  UpsellStageSchema,
  UpsellStageUpdateSchema,
  databaseUnavailable,
  parsed,
} from './database-unavailable.js';

export function registerPostUpsellIdentitiesReconcileRoutes(
  app: FastifyInstance,
  context0: ReturnType<typeof createCnameTargetContext>,
) {
  const { cnameTarget, redirectUrl, entryUrl, upsellUrl, project } = context0;

  app.post<{ Params: { id: string } }>(
    '/offers/:id/tracking/upsell-identities/reconcile',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
      if (!env.TRACKING_ENCRYPTION_KEY) {
        return reply.code(503).send({ error: 'tracking_encryption_unavailable' });
      }
      const receipts = await app.db<
        Array<{
          payload: unknown;
          connection_id: string;
        }>
      >`
        SELECT r.payload,r.connection_id
        FROM webhook_receipts r
        JOIN vendepay_connections c ON c.id=r.connection_id
        WHERE c.project_id=${p.id} AND r.received_at >= now()-interval '90 days'
        ORDER BY r.received_at DESC
        LIMIT 1000
      `;
      const stages = await app.db<
        Array<{
          destination_url: string;
          connection_destinations: Record<string, string> | null;
        }>
      >`
        SELECT destination_url,connection_destinations FROM tracking_upsell_stages
        WHERE project_id=${p.id} AND enabled=true
      `;
      let found = 0;
      let stored = 0;
      let candidatesTested = 0;
      const identitiesByOrder = new Map<
        string,
        {
          id: string;
          visitorId: string;
          vendidHash: string;
          vendidEncrypted: string;
          sourceOrderId: string;
          connectionId: string;
        }
      >();
      for (const receipt of receipts) {
        const normalized = normalizeVendepay(receipt.payload);
        if (normalized.kind !== 'processable') continue;
        const event = normalized.event;
        const [order] = await app.db<
          Array<{
            id: string;
            visitor_id: string | null;
            order_kind: string;
            buyer: Record<string, string>;
            paid_at: Date | null;
          }>
        >`
          SELECT id,visitor_id,order_kind,buyer,paid_at FROM tracking_orders
          WHERE project_id=${p.id} AND external_id=${event.transactionId}
          LIMIT 1
        `;
        if (!order?.paid_at || order.order_kind !== 'front' || event.status !== 'paid') continue;
        const candidates = collectVendaIdCandidates(receipt.payload, event.transactionId);
        let vendid: string | undefined;
        for (const candidate of candidates) {
          candidatesTested += 1;
          const validated = await Promise.all(
            stages.map((stage) => {
              const destination =
                stage.connection_destinations?.[receipt.connection_id] || stage.destination_url;
              return checkUpsellCompatibility(destination, candidate, true);
            }),
          );
          if (validated.some(Boolean)) {
            vendid = candidate;
            break;
          }
        }
        if (!vendid) {
          // Eligibility checks can fail transiently (timeout, rate limiting or
          // a temporary Vendepay outage). A failed refresh must never erase a
          // vendaId that was already confirmed for this approved front order.
          continue;
        }
        found += 1;
        const hash = createHash('sha256').update(vendid).digest('hex');
        const identityVisitorId = order.visitor_id ?? `vendepay:${event.transactionId}`;
        identitiesByOrder.set(order.id, {
          id: ulid(),
          visitorId: identityVisitorId,
          vendidHash: hash,
          vendidEncrypted: encryptSecret(vendid, env.TRACKING_ENCRYPTION_KEY),
          sourceOrderId: order.id,
          connectionId: receipt.connection_id,
        });
        stored += 1;
      }
      const identities = [
        ...new Map(
          [...identitiesByOrder.values()].map((identity) => [identity.vendidHash, identity]),
        ).values(),
      ];
      if (identities.length > 0) {
        await app.db.begin(async (sql) => {
          await sql`
            DELETE FROM tracking_upsell_identities existing
            USING unnest(
              ${sql.array(identities.map((identity) => identity.sourceOrderId))}::text[],
              ${sql.array(identities.map((identity) => identity.vendidHash))}::text[]
            ) AS refreshed(source_order_id, vendid_hash)
            WHERE existing.project_id=${p.id}
              AND existing.source_order_id=refreshed.source_order_id
              AND existing.vendid_hash<>refreshed.vendid_hash
          `;
          await sql`
            INSERT INTO tracking_upsell_identities
              (id,project_id,visitor_id,vendid_hash,vendid_encrypted,source_order_id,
               vendepay_connection_id)
            SELECT batch.id, ${p.id}, batch.visitor_id, batch.vendid_hash,
              batch.vendid_encrypted, batch.source_order_id, batch.vendepay_connection_id
            FROM unnest(
              ${sql.array(identities.map((identity) => identity.id))}::text[],
              ${sql.array(identities.map((identity) => identity.visitorId))}::text[],
              ${sql.array(identities.map((identity) => identity.vendidHash))}::text[],
              ${sql.array(identities.map((identity) => identity.vendidEncrypted))}::text[],
              ${sql.array(identities.map((identity) => identity.sourceOrderId))}::text[],
              ${sql.array(identities.map((identity) => identity.connectionId))}::text[]
            ) AS batch(
              id, visitor_id, vendid_hash, vendid_encrypted, source_order_id,
              vendepay_connection_id
            )
            ON CONFLICT(project_id,vendid_hash) DO UPDATE SET
              visitor_id=EXCLUDED.visitor_id,source_order_id=EXCLUDED.source_order_id,
              vendepay_connection_id=EXCLUDED.vendepay_connection_id,last_seen_at=now()
          `;
        });
      }
      return {
        inspected: receipts.length,
        candidates_tested: candidatesTested,
        vendid_found: found,
        identities_stored: stored,
        non_paid_removed: 0,
      };
    },
  );

  app.post<{ Params: { id: string } }>('/offers/:id/tracking/upsells', async (req, reply) => {
    const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
    if (!app.db) return reply.code(503).send(databaseUnavailable);
    if (!p) return reply.code(409).send({ error: 'tracking_not_configured' });
    const body = parsed(UpsellStageSchema, req.body);
    const connectionDestinations = body.connection_destinations ?? {};
    const connectionIds = Object.keys(connectionDestinations).filter(
      (key) =>
        !['gateway:vendepay', 'gateway:syzepay', 'gateway:paysight', 'gateway:explodely'].includes(
          key,
        ),
    );
    if (connectionIds.length) {
      const validConnections = await app.db<Array<{ id: string }>>`
        SELECT id FROM vendepay_connections
        WHERE project_id=${p.id} AND id IN ${app.db(connectionIds)}
      `;
      if (validConnections.length !== connectionIds.length) {
        return reply.code(400).send({ error: 'invalid_vendepay_connection' });
      }
    }
    const slug = ulid().toLowerCase();
    const [existing] = await app.db<Array<{ id: string }>>`
      SELECT id FROM tracking_upsell_stages
      WHERE project_id=${p.id} AND stage_key=${body.stage_key}
      LIMIT 1
    `;
    if (existing) {
      return reply.code(409).send({
        error: 'upsell_stage_already_exists',
        detail: 'Essa etapa já está cadastrada. Edite a etapa existente em vez de criar outra.',
      });
    }
    const [stage] = await app.db<Array<{ slug: string } & Record<string, unknown>>>`
      INSERT INTO tracking_upsell_stages
        (id,project_id,stage_key,name,slug,destination_url,connection_destinations)
      VALUES(${ulid()},${p.id},${body.stage_key},${body.name},${slug},${body.destination_url},
        ${app.db.json(connectionDestinations)})
      RETURNING id,stage_key,name,slug,destination_url,connection_destinations,
        enabled,created_at,updated_at
    `;
    if (!stage) return reply.code(500).send({ error: 'upsell_stage_not_created' });
    return reply.code(201).send({ ...stage, secure_url: upsellUrl(String(stage.slug)) });
  });

  app.patch<{ Params: { id: string; stageId: string } }>(
    '/offers/:id/tracking/upsells/:stageId',
    async (req, reply) => {
      const p = await project(req.params.id, req.user!.sub, req.user!.role === 'admin', true);
      if (!app.db) return reply.code(503).send(databaseUnavailable);
      if (!p) return reply.code(404).send({ error: 'tracking_not_configured' });
      const body = parsed(UpsellStageUpdateSchema, req.body);
      const connectionDestinations = body.connection_destinations ?? {};
      const connectionIds = Object.keys(connectionDestinations).filter(
        (key) =>
          ![
            'gateway:vendepay',
            'gateway:syzepay',
            'gateway:paysight',
            'gateway:explodely',
          ].includes(key),
      );
      if (connectionIds.length) {
        const validConnections = await app.db<Array<{ id: string }>>`
          SELECT id FROM vendepay_connections
          WHERE project_id=${p.id} AND id IN ${app.db(connectionIds)}
        `;
        if (validConnections.length !== connectionIds.length) {
          return reply.code(400).send({ error: 'invalid_vendepay_connection' });
        }
      }
      const [stage] = await app.db`
        UPDATE tracking_upsell_stages SET name=${body.name},destination_url=${body.destination_url},
          connection_destinations=${app.db.json(connectionDestinations)},
          enabled=COALESCE(${body.enabled ?? null},enabled),updated_at=now()
        WHERE id=${req.params.stageId} AND project_id=${p.id}
        RETURNING id,stage_key,name,slug,destination_url,connection_destinations,
          enabled,created_at,updated_at
      `;
      if (!stage) return reply.code(404).send({ error: 'upsell_stage_not_found' });
      return { ...stage, secure_url: upsellUrl(String(stage.slug)) };
    },
  );
}
