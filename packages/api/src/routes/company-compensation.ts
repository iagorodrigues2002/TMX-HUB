import type { FastifyInstance } from 'fastify';
import type { Sql, TransactionSql } from 'postgres';
import { z } from 'zod';
import { NotFoundError } from '../lib/problem.js';
import {
  compensationMonthSchema,
  compensationSchema,
  compensationTotal,
  defaultCompensation,
} from '../services/company-compensation.js';
import { hasGatewayApproval } from './upsell-operator-audit.js';

const paramsSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().min(1),
  month: compensationMonthSchema,
});

// Callers must authorize the company manager before reading or saving financial data.
export async function readCompanyCompensation(
  sql: Sql | TransactionSql,
  company: string,
  userId: string,
  month: string,
) {
  const [member] =
    await sql`SELECT user_id FROM company_memberships WHERE company_id=${company} AND user_id=${userId}`;
  if (!member) throw new NotFoundError();
  const [saved] =
    await sql`SELECT settings FROM company_member_compensation WHERE company_id=${company} AND user_id=${userId} AND month=${`${month}-01`}`;
  const settings = compensationSchema.parse(saved?.settings ?? defaultCompensation);
  // The persisted credit and gateway proof establish eligibility, including paid reopens.
  const rows = await sql`
    SELECT o.id AS order_id,o.provider,o.paid_at AS approved_at,o.order_kind AS stage_key,o.amount_minor,o.currency,
      (SELECT jsonb_agg(r.payload) FROM webhook_receipts r WHERE r.order_id=o.id AND r.connection_id=o.vendepay_connection_id AND r.state='processed'
        AND COALESCE(r.payload->>'test','false') NOT IN ('true','1') AND COALESCE(r.payload->>'is_test','false') NOT IN ('true','1')) receipt_payloads
    FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id
    JOIN company_offers co ON co.offer_id=p.offer_id AND co.company_id=${company}
    JOIN tracking_upsell_operator_credits c ON c.order_id=o.id AND c.project_id=o.project_id AND c.operator_id=${userId}
    JOIN tracking_upsell_operator_attempts a ON a.id=c.attempt_id AND a.project_id=o.project_id
    WHERE o.paid_at IS NOT NULL AND a.opened_at<=o.paid_at
      AND a.opened_at>=(${`${month}-01`}::date::timestamp AT TIME ZONE 'America/Sao_Paulo')
      AND a.opened_at<((${`${month}-01`}::date+interval '1 month') AT TIME ZONE 'America/Sao_Paulo')
      AND (o.order_kind='upsell' OR o.order_kind ~ '^upsell_[2-9][0-9]*$')
      AND (o.provider='vendepay' OR (o.provider='syzepay' AND EXISTS (
        SELECT 1 FROM syzepay_inbox_receipts r WHERE r.tracking_order_id=o.id AND r.connection_id=o.syzepay_connection_id AND r.state='processed' AND r.authenticity='signature_verified')))`;
  const upsells = rows.filter((row) =>
    hasGatewayApproval(row as Parameters<typeof hasGatewayApproval>[0]),
  ).length;
  return { configured: Boolean(saved), settings, upsells, ...compensationTotal(settings, upsells) };
}

export async function saveCompanyCompensation(
  sql: TransactionSql,
  company: string,
  userId: string,
  month: string,
  settings: z.infer<typeof compensationSchema>,
  actorId: string,
) {
  const [member] =
    await sql`SELECT user_id FROM company_memberships WHERE company_id=${company} AND user_id=${userId}`;
  if (!member) throw new NotFoundError();
  await sql`INSERT INTO company_member_compensation(company_id,user_id,month,settings) VALUES(${company},${userId},${`${month}-01`},${sql.json(settings)})
    ON CONFLICT(company_id,user_id,month) DO UPDATE SET settings=EXCLUDED.settings,updated_at=now()`;
  await sql`INSERT INTO company_access_audit(company_id,actor_id,action,subject_id) VALUES(${company},${actorId},'compensation.updated',${userId})`;
}

export function registerCompanyCompensation(
  app: FastifyInstance,
  manager: (
    sql: Sql | TransactionSql,
    company: string,
    user: string,
    lock?: boolean,
  ) => Promise<unknown>,
) {
  const path = '/companies/:id/payees/:userId/compensation/:month';
  app.get(path, async (req) => {
    const { id, userId, month } = paramsSchema.parse(req.params);
    await manager(app.db!, id, req.user!.sub);
    return readCompanyCompensation(app.db!, id, userId, month);
  });
  app.put(path, async (req) => {
    const { id, userId, month } = paramsSchema.parse(req.params);
    const settings = compensationSchema.parse(req.body);
    await app.db!.begin(async (sql) => {
      await manager(sql, id, req.user!.sub, true);
      await saveCompanyCompensation(sql, id, userId, month, settings, req.user!.sub);
    });
    return { saved: true };
  });
}
