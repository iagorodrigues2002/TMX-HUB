import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { ulid } from 'ulid';
import { z } from 'zod';
import { env } from '../env.js';
import { decryptSecret } from '../lib/secret-box.js';
import { zodToProblem } from '../lib/problem.js';
import { buildSyzepayRecoveryUrl, validateSyzepayRecovery } from '../services/syzepay-upsell.js';
import { normalizeVendepay } from '../integrations/vendepay/normalize.js';
import { canAccessOffer } from '../services/offer-store.js';

const OpenSchema = z.object({ click_id: z.string().regex(/^[a-zA-Z0-9_-]{16,80}$/), view_only: z.boolean().optional() }).strict();
type Attempt = { id: string; operator_id: string; order_id: string; stage_id: string; stage_key: string; provider: string; opened_at: Date };
type Approval = { order_id: string; stage_key: string; provider: string; approved_at: Date; amount_minor: string | number | null; currency: string | null; amount_brl_minor?: string | number | null; operator_id?: string | null };
type ApprovalCandidate = Approval & { receipt_payloads: unknown[] | null };
type LogRequest = { Params: { id?: string }; Querystring: { limit?: string; from?: string; to?: string } };
const AuditDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const date = new Date(`${value}T12:00:00Z`);
  return !value.startsWith('0000') && Number.isFinite(date.getTime()) && date.toISOString().slice(0,10) === value;
});
export const OperatorLogQuery = z.object({limit:z.string().optional(),from:AuditDate.optional(),to:AuditDate.optional()})
  .strict().refine(q=>Boolean(q.from)===Boolean(q.to),{message:'Informe o início e o fim do período.'})
  .refine(q=>!q.from || !q.to || q.from<=q.to,{message:'O início deve ser anterior ou igual ao fim.'});

export function hasGatewayApproval(row: ApprovalCandidate) {
  if (row.provider === 'syzepay') return true; // SQL requires processed, signature-verified order.paid receipt.
  return row.provider === 'vendepay' && (row.receipt_payloads ?? []).some(payload => {
    const normalized = normalizeVendepay(payload);
    return normalized.kind === 'processable' && normalized.event.status === 'paid';
  });
}

// Business attribution by the immutable last preapproval opening, not proof
// that the operator personally completed the payment. One credit per order.
export function operatorAuditSummary(attempts: Attempt[], approvals: Approval[]) {
  type Total = { currency: string | null; count: number; amount_minor: number | null };
  const operators = new Map<string, { operator_id: string; openings: number; confirmed_purchases: number; amounts: Total[] }>();
  const operator = (id: string) => {
    if (!operators.has(id)) operators.set(id, { operator_id: id, openings: 0, confirmed_purchases: 0, amounts: [] });
    return operators.get(id)!;
  };
  for (const row of attempts) operator(row.operator_id).openings++;
  const currencies: Total[] = [];
  for (const row of new Map(approvals.map(row => [row.order_id, row])).values()) {
    const owner = row.operator_id ? operator(row.operator_id) : null;
    if (owner) owner.confirmed_purchases++;
    const amounts = owner?.amounts ?? currencies;
    const currency = row.amount_brl_minor != null ? 'BRL' : row.currency;
    let total = amounts.find(total => total.currency === currency);
    if (!total) { total = { currency, count: 0, amount_minor: 0 }; amounts.push(total); }
    total.count++;
    const rawAmount = row.amount_brl_minor ?? row.amount_minor;
    const amount = rawAmount === null ? null : Number(rawAmount);
    total.amount_minor = total.amount_minor === null || amount === null || !Number.isSafeInteger(amount)
      ? null : total.amount_minor + amount;
    if (total.amount_minor !== null && !Number.isSafeInteger(total.amount_minor)) total.amount_minor = null;
  }
  return {
    summary: [...operators.values()].sort((a,b) => b.confirmed_purchases-a.confirmed_purchases || a.operator_id.localeCompare(b.operator_id)),
    unattributed_totals: currencies,
  };
}

export function registerUpsellOperatorAudit(app: FastifyInstance) {
  async function scope(offerId: string, operatorId: string, admin: boolean) {
    await app.offerStore.assertAccess(offerId, operatorId, admin);
    if (!app.db) return null;
    const [project] = await app.db<{ id: string }[]>`SELECT id FROM tracking_projects WHERE offer_id=${offerId}`;
    return project ? { projectId: project.id, all: admin } : null;
  }

  app.post<{ Params: { id: string; orderId: string; stageId: string }; Body: { click_id: string; view_only?: boolean } }>(
    '/offers/:id/tracking/upsell-identities/:orderId/stages/:stageId/open', async (req, reply) => {
      if (!req.user) return reply.code(401).send({ error: 'authentication_required' });
      const access = await scope(req.params.id, req.user!.sub, req.user!.role === 'admin');
      reply.header('cache-control', 'private, no-store');
      if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
      if (!access) return reply.code(404).send({ error: 'tracking_not_configured' });
      const parsed = OpenSchema.safeParse(req.body);
      if (!parsed.success) return reply.code(422).send(zodToProblem(parsed.error));
      const [target] = await app.db<{
        order_id: string; stage_id: string; stage_key: string; provider: string; slug: string;
        session_id: string | null; syzepay_destination: string | null; vendid_encrypted: string | null;
      }[]>`
        SELECT o.id AS order_id,s.id AS stage_id,s.stage_key,o.provider,s.slug,
          o.attribution_source->>'syzepay_session_id' AS session_id,
          s.connection_destinations->>'gateway:syzepay' AS syzepay_destination,
          identity.vendid_encrypted
        FROM tracking_orders o JOIN tracking_upsell_stages s ON s.project_id=o.project_id
        LEFT JOIN LATERAL (
          SELECT i.vendid_encrypted FROM tracking_upsell_identities i
          WHERE i.project_id=o.project_id AND i.source_order_id=o.id
          ORDER BY i.last_seen_at DESC LIMIT 1
        ) identity ON true
        WHERE o.project_id=${access.projectId} AND o.id=${req.params.orderId} AND s.id=${req.params.stageId}
          AND s.enabled=true AND o.order_kind='front' AND o.paid_at IS NOT NULL
      `;
      if (!target) return reply.code(404).send({ error: 'upsell_open_target_not_found' });
      let url: string;
      if (target.provider === 'syzepay' && target.session_id && target.syzepay_destination) {
        if (parsed.data.view_only) {
          // The pre-existing already-purchased action opens the saved page in force mode.
          url = buildSyzepayRecoveryUrl(target.syzepay_destination, target.session_id);
        } else {
          const checked = await validateSyzepayRecovery(target.syzepay_destination, target.session_id);
          if (!checked.compatible || !checked.url) return reply.code(409).send({ error: 'upsell_session_unavailable' });
          url = checked.url;
        }
      } else if (target.provider === 'vendepay' && target.vendid_encrypted && env.TRACKING_ENCRYPTION_KEY) {
        let vendid: string;
        try { vendid = decryptSecret(target.vendid_encrypted, env.TRACKING_ENCRYPTION_KEY); }
        catch { return reply.code(409).send({ error: 'upsell_identity_unavailable' }); }
        const destination = new URL(`${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/u/${target.slug}`);
        destination.searchParams.set('vendaId', vendid);
        url = destination.toString();
      } else return reply.code(409).send({ error: 'upsell_identity_unavailable' });
      if (parsed.data.view_only) {
        const destination = new URL(url);
        destination.searchParams.set('force', '1');
        url = destination.toString();
      }
      const safeUrl = new URL(url);
      if (safeUrl.protocol !== 'https:' || safeUrl.username || safeUrl.password)
        return reply.code(409).send({ error: 'upsell_destination_unsafe' });
      const [attempt] = await app.db<Attempt[]>`
        INSERT INTO tracking_upsell_operator_attempts(id,project_id,order_id,stage_id,stage_key,provider,operator_id,click_id,view_only)
        VALUES(${ulid()},${access.projectId},${target.order_id},${target.stage_id},${target.stage_key},${target.provider},${req.user!.sub},${parsed.data.click_id},${parsed.data.view_only ?? false})
        ON CONFLICT(project_id,operator_id,click_id) DO NOTHING
        RETURNING id,operator_id,order_id,stage_id,stage_key,provider,opened_at
      `;
      const existing = attempt ?? (await app.db<Attempt[]>`
        SELECT id,operator_id,order_id,stage_id,stage_key,provider,opened_at FROM tracking_upsell_operator_attempts
        WHERE project_id=${access.projectId} AND operator_id=${req.user!.sub} AND click_id=${parsed.data.click_id}
      `)[0];
      if (!existing || existing.order_id !== target.order_id || existing.stage_id !== target.stage_id)
        return reply.code(409).send({ error: 'upsell_click_id_conflict' });
      return { attempt_id: existing.id, opened_at: existing.opened_at, url };
    },
  );

  const logsHandler = async (req: FastifyRequest<LogRequest>, reply: FastifyReply) => {
      if (!req.user) return reply.code(401).send({ error: 'authentication_required' });
      reply.header('cache-control', 'private, no-store');
      const query = OperatorLogQuery.safeParse(req.query);
      if (!query.success) return reply.code(400).send({error:'invalid_audit_period',detail:'Informe datas válidas e um intervalo em ordem.'});
      if (!app.db) return reply.code(503).send({ error: 'tracking_database_unavailable' });
      const admin = req.user.role === 'admin';
      let projectIds: string[];
      if (req.params.id) {
        const access = await scope(req.params.id, req.user.sub, admin);
        if (!access) return reply.code(404).send({ error: 'tracking_not_configured' });
        projectIds = [access.projectId];
      } else {
        // Never use a client-supplied tenant/project list for the global view.
        const projects = await app.db<{id:string;offer_id:string}[]>`SELECT id,offer_id FROM tracking_projects`;
        const allowed = await Promise.all(projects.map(async project=>{
          const offer = await app.offerStore.maybeGet(project.offer_id);
          return offer && canAccessOffer(offer,req.user!.sub,admin) ? project.id : null;
        }));
        projectIds = allowed.filter((id):id is string=>id!==null);
      }
      const from = query.data.from ?? null, to = query.data.to ?? null;
      const parsedLimit = Number(query.data.limit ?? 50);
      const limit = Number.isFinite(parsedLimit) ? Math.min(200, Math.max(1, Math.floor(parsedLimit))) : 50;
      const attempts = await app.db<Attempt[]>`
        SELECT id,operator_id,order_id,stage_id,stage_key,provider,opened_at FROM tracking_upsell_operator_attempts
        WHERE project_id=ANY(${projectIds}::text[]) AND (${admin} OR operator_id=${req.user!.sub})
          AND (${from}::date IS NULL OR opened_at >= (${from}::date::timestamp AT TIME ZONE 'America/Sao_Paulo'))
          AND (${to}::date IS NULL OR opened_at < ((${to}::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))
        ORDER BY opened_at DESC,id DESC
      `;
      // Only real gateway-paid orders, each primary key once. Manual test results are never read.
      // Pick the winner before filtering by viewer. Never assign each viewer
      // their own older click when someone else had the last qualifying one.
      const candidates = await app.db<ApprovalCandidate[]>`
        SELECT o.id AS order_id,CASE WHEN o.order_kind='upsell' THEN 'upsell_1' ELSE o.order_kind END AS stage_key,
          o.provider,o.paid_at AS approved_at,o.amount_minor,o.currency,o.amount_brl_minor,credit.operator_id,
          CASE WHEN o.provider='vendepay' THEN (
            SELECT jsonb_agg(proof.payload) FROM (
              SELECT r.payload FROM webhook_receipts r
              WHERE r.order_id=o.id AND r.connection_id=o.vendepay_connection_id AND r.state='processed'
                AND COALESCE(r.payload->>'test','false') NOT IN ('true','1')
                AND COALESCE(r.payload->>'is_test','false') NOT IN ('true','1')
              ORDER BY r.received_at ASC LIMIT 20
            ) proof
          ) ELSE NULL END AS receipt_payloads
        FROM tracking_orders o
        LEFT JOIN tracking_upsell_operator_credits credit ON credit.order_id=o.id AND credit.project_id=o.project_id
        LEFT JOIN tracking_upsell_operator_attempts credited_click ON credited_click.id=credit.attempt_id AND credited_click.project_id=o.project_id
        WHERE o.project_id=ANY(${projectIds}::text[]) AND o.paid_at IS NOT NULL
          AND (${admin} OR credit.operator_id=${req.user!.sub})
          -- The immutable winner is chosen before applying the date window.
          -- An older click in this window must not replace the real winner.
          AND (${from}::date IS NULL OR credited_click.opened_at >= (${from}::date::timestamp AT TIME ZONE 'America/Sao_Paulo'))
          AND (${to}::date IS NULL OR credited_click.opened_at < ((${to}::date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo'))
          AND o.provider IN ('vendepay','syzepay')
          AND (o.order_kind='upsell' OR o.order_kind ~ '^upsell_[2-9][0-9]*$')
          AND (
            (o.provider='syzepay' AND EXISTS (
              SELECT 1 FROM syzepay_inbox_receipts r WHERE r.tracking_order_id=o.id
                AND r.connection_id=o.syzepay_connection_id AND r.state='processed' AND r.authenticity='signature_verified'
            )) OR (o.provider='vendepay' AND (
              EXISTS (SELECT 1 FROM webhook_receipts r WHERE r.order_id=o.id AND r.connection_id=o.vendepay_connection_id AND r.state='processed'
                AND COALESCE(r.payload->>'test','false') NOT IN ('true','1')
                AND COALESCE(r.payload->>'is_test','false') NOT IN ('true','1'))
            ))
          )
          AND o.paid_at >= (SELECT min(opened_at) FROM tracking_upsell_operator_attempts WHERE project_id=o.project_id)
        ORDER BY o.paid_at DESC,o.id DESC
      `;
      const approvals: Approval[] = candidates.filter(hasGatewayApproval).map(({ receipt_payloads: _proof, ...row }) => row);
      const { summary, unattributed_totals } = operatorAuditSummary(attempts, approvals);
      const names = new Map(await Promise.all([...new Set(summary.map(row => row.operator_id))].map(async id => {
        const user = await app.userStore.maybeGetById(id);
        return [id, user?.name ?? null] as const;
      })));
      return {
        scope: admin ? (req.params.id ? 'offer' : 'all_offers') : 'self', attempts: attempts.slice(0,limit).map(row => ({ ...row, operator_name: names.get(row.operator_id) ?? null })),
        approvals: approvals.slice(0,limit).map(row => ({ ...row, amount_minor: row.amount_minor === null ? null : Number(row.amount_minor), operator_id: row.operator_id ?? null, attribution: row.operator_id ? 'last_preapproval_click' : 'operator_not_determined' })),
        summary: summary.map(row => ({ ...row, operator_name: names.get(row.operator_id) ?? null })), unattributed_totals,
        limit, summary_scope: from ? 'click_period' : 'all_recorded_history',
        date_basis:'click',period:{from,to,time_zone:'America/Sao_Paulo'},
        attribution_notice: 'Upsell aprovado atribuído ao último clique registrado antes da aprovação, na mesma compra de origem, etapa e gateway. É uma regra de crédito operacional, não prova de quem concluiu o pagamento. Valores brutos aprovados; devoluções não descontadas. Sem cruzamento único, fica sem operador. Valores sem conversão em reais permanecem na moeda original.',
      };
    };
  app.get<LogRequest>('/offers/:id/tracking/upsell-operator-logs',logsHandler);
  app.get<LogRequest>('/tracking/upsell-operator-logs',logsHandler);
}
