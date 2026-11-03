import type { TaskPerson } from '@page-cloner/shared';
import type { Sql, TransactionSql } from 'postgres';
import { HttpProblem } from './problem.js';

type Database = Sql | TransactionSql;
export type OperationActor = { id: string; admin: boolean };
const denied = () =>
  new HttpProblem({
    status: 403,
    code: 'company_operation_forbidden',
    title: 'Acesso negado',
    detail: 'Gerencie apenas tarefas e calls das empresas autorizadas.',
  });

export async function operationScope(
  db: Database,
  actor: OperationActor,
  companyId?: string | null,
) {
  if (actor.admin) return { global: !companyId, companyIds: companyId ? [companyId] : [] };
  const schema = await db`SELECT to_regclass('company_memberships') AS name`;
  if (!schema?.[0]?.name) throw denied();
  const rows = await db`SELECT company_id::text AS id FROM company_memberships
      WHERE user_id=${actor.id} AND status='active'
        AND (role IN ('owner','admin') OR (role='member' AND 'nav:task-management'=ANY(tools)))`;
  const ids = rows.map((r) => r.id as string);
  if (!ids.length || (companyId && !ids.includes(companyId))) throw denied();
  return { global: false, companyIds: companyId ? [companyId] : ids };
}

/** Participant privileges never imply management access; unscoped legacy is restricted. */
export async function participantHasCompanyAccess(
  db: Database,
  userId: string,
  companyId?: string | null,
) {
  if (companyId)
    return (
      (
        await db`SELECT 1 FROM company_memberships WHERE company_id::text=${companyId} AND user_id=${userId} AND status='active' LIMIT 1`
      ).length > 0
    );
  const [schema] = await db`SELECT to_regclass('company_memberships') AS name`;
  if (!schema?.name) return true;
  return (await db`SELECT 1 FROM company_memberships WHERE user_id=${userId} LIMIT 1`).length === 0;
}

export async function assertOperationAccess(
  db: Database,
  actor: OperationActor,
  companyId?: string | null,
  participantUserIds: string[] = [],
) {
  if (actor.admin) return;
  if (
    participantUserIds.includes(actor.id) &&
    (await participantHasCompanyAccess(db, actor.id, companyId))
  )
    return;
  if (!companyId) throw denied();
  await operationScope(db, actor, companyId);
}

export async function assertOperationCompany(
  db: Database,
  actor: OperationActor,
  companyId?: string | null,
) {
  await assertOperationAccess(db, actor, companyId);
  if (companyId && !(await db`SELECT id FROM companies WHERE id::text=${companyId}`).length)
    throw denied();
}

export async function assertCompanyPeople(
  db: Database,
  companyId: string | null | undefined,
  people: TaskPerson[],
) {
  if (!companyId) return; // Global-only legacy commands retain their explicit recipients.
  const ids = people.map((p) => p.userId).filter((id): id is string => !!id);
  if (ids.length !== people.length) throw denied();
  const rows =
    await db`SELECT user_id FROM company_memberships WHERE company_id::text=${companyId} AND status='active' AND user_id=ANY(${ids}::text[])`;
  if (new Set(rows.map((r) => r.user_id)).size !== new Set(ids).size) throw denied();
}
