import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { ulid } from 'ulid';
import { env } from '../env.js';
import { decryptSecret, encryptSecret } from '../lib/secret-box.js';
import { collectVendaIdCandidates } from '../services/vendepay-venda-id.js';
import { checkUpsellCompatibilityDetailed } from '../services/upsell-compatibility.js';
import { validateUpsellCandidates } from '../services/upsell-identity-validation.js';

/** Postgres-backed queue: survives Redis outages and leases work across replicas. */
export function startUpsellIdentityWorker(app: Pick<FastifyInstance, 'db' | 'log'>) {
  let stopped = false;
  let running: Promise<void> | null = null;
  const sql = app.db;
  if (!sql || !env.TRACKING_ENCRYPTION_KEY) return { close: async () => {} };
  const encryptionKey = env.TRACKING_ENCRYPTION_KEY;
  const processOne = async () => {
    const token = ulid();
    const [job] = await sql<Array<{ order_id: string; attempts: number }>>`
      WITH candidate AS (
        SELECT q.order_id FROM tracking_upsell_identity_validation q
        JOIN tracking_orders o ON o.id=q.order_id
        WHERE ((q.state IN ('pending','retry') AND q.next_attempt_at <= now())
          OR (q.state='processing' AND q.lease_until < now()))
          AND q.attempts < 6
        ORDER BY o.paid_at DESC,q.next_attempt_at ASC LIMIT 1 FOR UPDATE OF q SKIP LOCKED
      )
      UPDATE tracking_upsell_identity_validation q
      SET state='processing',attempts=q.attempts+1,lease_until=now()+interval '5 minutes',
          lease_token=${token},updated_at=now()
      FROM candidate WHERE q.order_id=candidate.order_id
      RETURNING q.order_id,q.attempts
    `;
    if (!job) return;
    try {
      const [order] = await sql<Array<{
        project_id: string; external_id: string; visitor_id: string | null;
        vendepay_connection_id: string; payload: unknown; processing_payload_encrypted: string | null;
      }>>`
        SELECT o.project_id,o.external_id,o.visitor_id,o.vendepay_connection_id,
               wr.payload,wr.processing_payload_encrypted
        FROM tracking_orders o
        JOIN vendepay_connections vc ON vc.id=o.vendepay_connection_id AND vc.enabled=true
        JOIN LATERAL (
          SELECT payload,processing_payload_encrypted FROM webhook_receipts
          WHERE order_id=o.id ORDER BY received_at DESC LIMIT 1
        ) wr ON true
        WHERE o.id=${job.order_id} AND o.status='paid' AND o.order_kind='front'
      `;
      if (!order) throw new Error('approved_front_receipt_unavailable');
      const stages = await sql<Array<{ destination_url: string; connection_destinations: Record<string,string> | null }>>`
        SELECT destination_url,connection_destinations FROM tracking_upsell_stages
        WHERE project_id=${order.project_id} AND enabled=true ORDER BY id LIMIT 5
      `;
      const destinations = [...new Set(stages.map(stage => {
        const mapping = stage.connection_destinations ?? {};
        return Object.keys(mapping).length
          ? mapping[order.vendepay_connection_id]
          : stage.destination_url;
      }).filter((url): url is string => Boolean(url)))];
      const payload = order.processing_payload_encrypted
        ? JSON.parse(decryptSecret(order.processing_payload_encrypted,encryptionKey))
        : order.payload;
      const result = await validateUpsellCandidates(
        collectVendaIdCandidates(payload,order.external_id),destinations,
        (destination,candidate) => checkUpsellCompatibilityDetailed(destination,candidate,true,
          { timeoutMs: 4_000, retryDelaysMs: [0] }),
      );
      await sql.begin(async tx => {
        const [locked] = await tx`
          SELECT order_id FROM tracking_upsell_identity_validation
          WHERE order_id=${job.order_id} AND lease_token=${token} AND state='processing' FOR UPDATE
        `;
        if (!locked) return;
        if (result.vendid) {
          // Never replace an identity already confirmed by the page/manual recovery.
          await tx`
            INSERT INTO tracking_upsell_identities
              (id,project_id,visitor_id,vendid_hash,vendid_encrypted,source_order_id,vendepay_connection_id)
            SELECT ${ulid()},${order.project_id},${order.visitor_id ?? `vendepay:${order.external_id}`},
              ${createHash('sha256').update(result.vendid).digest('hex')},
              ${encryptSecret(result.vendid,encryptionKey)},${job.order_id},${order.vendepay_connection_id}
            WHERE EXISTS(SELECT 1 FROM tracking_orders WHERE id=${job.order_id} AND status='paid')
              AND NOT EXISTS(SELECT 1 FROM tracking_upsell_identities
                WHERE project_id=${order.project_id} AND source_order_id=${job.order_id})
            ON CONFLICT(project_id,vendid_hash) DO NOTHING
          `;
        }
        const [identity] = result.vendid ? await tx`
          SELECT 1 FROM tracking_upsell_identities
          WHERE project_id=${order.project_id} AND source_order_id=${job.order_id}
        ` : [];
        const state = identity ? 'confirmed' : result.vendid ? 'failed' : result.temporary
          ? (job.attempts >= 6 ? 'failed' : 'retry') : 'rejected';
        await tx`
          UPDATE tracking_upsell_identity_validation
          SET state=${state},last_error=${identity ? null : result.vendid ? 'buyer_sale_id_already_bound' : result.reason},
              next_attempt_at=now()+${Math.min(1800,30*2**(job.attempts-1))}*interval '1 second',
              lease_until=NULL,lease_token=NULL,updated_at=now()
          WHERE order_id=${job.order_id} AND lease_token=${token}
        `;
      });
    } catch (error) {
      app.log.warn({ orderId: job.order_id, error }, 'upsell identity validation failed');
      await sql`
        UPDATE tracking_upsell_identity_validation
        SET state=${job.attempts >= 6 ? 'failed' : 'retry'},last_error='validation_processing_error',
            next_attempt_at=now()+interval '1 minute',lease_until=NULL,lease_token=NULL,updated_at=now()
        WHERE order_id=${job.order_id} AND lease_token=${token}
      `;
    }
  };
  const cycle = async () => {
    // Includes historical fronts and newly classified products; bounded backfill.
    await sql`
      INSERT INTO tracking_upsell_identity_validation(order_id)
      SELECT o.id FROM tracking_orders o
      JOIN vendepay_connections vc ON vc.id=o.vendepay_connection_id AND vc.enabled=true
      WHERE o.provider='vendepay' AND vc.payload_adapter='vendepay'
        AND o.status='paid' AND o.order_kind='front' AND o.paid_at>now()-interval '90 days'
        AND EXISTS(SELECT 1 FROM tracking_upsell_stages s WHERE s.project_id=o.project_id AND s.enabled=true)
        AND EXISTS(SELECT 1 FROM webhook_receipts r WHERE r.order_id=o.id)
        AND NOT EXISTS(SELECT 1 FROM tracking_upsell_identities i WHERE i.project_id=o.project_id AND i.source_order_id=o.id)
        AND NOT EXISTS(SELECT 1 FROM tracking_upsell_identity_validation q WHERE q.order_id=o.id)
      ORDER BY o.paid_at DESC LIMIT 250 ON CONFLICT(order_id) DO NOTHING
    `;
    await sql`
      UPDATE tracking_upsell_identity_validation SET state='failed',last_error='validation_worker_interrupted',
        lease_until=NULL,lease_token=NULL,updated_at=now()
      WHERE state='processing' AND lease_until<now() AND attempts>=6
    `;
    await Promise.all([processOne(),processOne()]);
  };
  const tick = () => {
    if (stopped || running) return;
    running = cycle().catch(error => app.log.error({error},'upsell identity queue cycle failed'))
      .finally(() => { running=null; });
  };
  const timer=setInterval(tick,10_000);
  timer.unref();
  tick();
  return { close: async () => { stopped=true;clearInterval(timer);await running; } };
}
