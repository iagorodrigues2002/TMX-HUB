import { createHash, randomUUID } from 'node:crypto';
import type { ManagedCall, ManagedTask, TaskPerson, TaskStatus } from '@page-cloner/shared';
import type { Sql, TransactionSql } from 'postgres';
import { env } from '../env.js';
import {
  assertCompanyPeople,
  assertOperationAccess,
  assertOperationCompany,
  participantHasCompanyAccess,
} from '../lib/company-operation-access.js';
import { HttpProblem } from '../lib/problem.js';

type Actor = { id: string; admin: boolean; requireAssignment?: boolean };
type TaskFields = {
  title: string;
  description: string;
  priority: ManagedTask['priority'];
  dueAt: string | null;
  assigneeIds: string[];
};
const problem = (status: number, code: string, detail: string) =>
  new HttpProblem({ status, code, title: code, detail });

export async function nativeRequest<T extends ManagedTask | ManagedCall>(
  db: Sql,
  key: string,
  actor: Actor,
  action: string,
  input: unknown,
  run: (tx: TransactionSql) => Promise<{ kind: 'task' | 'call'; id: string; result: T }>,
): Promise<T> {
  const requestHash = createHash('sha256').update(JSON.stringify({ action, input })).digest('hex');
  return db.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(hashtext(${key}))`;
    const [previous] =
      await tx`SELECT actor_id,request_hash,response,entity_kind,entity_id FROM managed_native_requests WHERE id=${key}`;
    if (previous) {
      if (previous.actor_id !== actor.id || previous.request_hash !== requestHash)
        throw problem(409, 'idempotency_conflict', 'Chave já utilizada em outra operação.');
      const [current] =
        previous.entity_kind === 'task'
          ? await tx`SELECT body FROM managed_tasks WHERE id=${previous.entity_id} FOR UPDATE`
          : await tx`SELECT body FROM managed_calls WHERE id=${previous.entity_id} FOR UPDATE`;
      if (!current) throw problem(404, 'operation_not_found', 'Registro não encontrado.');
      const response = current.body as T;
      if (actor.requireAssignment && 'assignees' in response)
        await assertTaskAssignment(tx, actor, response);
      await assertOperationAccess(
        tx,
        actor,
        response.companyId,
        action === 'task.status' && 'assignees' in response
          ? response.assignees.flatMap((p) => (p.userId ? [p.userId] : []))
          : [],
      );
      return previous.response as T;
    }
    const saved = await run(tx);
    await tx`INSERT INTO managed_native_requests(id,actor_id,request_hash,action,entity_kind,entity_id,response) VALUES(${key},${actor.id},${requestHash},${action},${saved.kind},${saved.id},${tx.json(saved.result)})`;
    return saved.result;
  }) as Promise<T>;
}

export async function nativePeople(
  tx: TransactionSql,
  ids: string[],
  companyId?: string | null,
): Promise<TaskPerson[]> {
  const people = await tx`SELECT body FROM managed_task_people WHERE id IN ${tx(ids)}`;
  if (people.length !== ids.length || people.some((p) => !p.body.userId))
    throw problem(400, 'assignee_unmapped', 'Vincule todos os responsáveis a uma conta TMX.');
  const result = people.map((p) => p.body as TaskPerson);
  await assertCompanyPeople(tx, companyId, result);
  return result;
}

export async function queueNativeDelivery(
  tx: TransactionSql,
  task: ManagedTask | ManagedCall,
  kind: 'task' | 'call' = 'task',
) {
  const channel =
    task.discordChannelId ??
    ('sector' in task
      ? nativeDiscordChannel(task.sector, task.offer, task.companyId)
      : nativeDiscordChannel('Calls', null, task.companyId));
  await tx`INSERT INTO managed_native_deliveries(id,entity_kind,entity_id,revision,body,target_channel_id)
    VALUES(${`${kind}:${task.id}`},${kind},${task.id},${task.revision!},${tx.json(task)},${channel})
    ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,body=excluded.body,
      state=CASE WHEN managed_native_deliveries.state IN ('processing','uncertain') THEN managed_native_deliveries.state ELSE 'queued' END,
      attempts=CASE WHEN managed_native_deliveries.state IN ('processing','uncertain') THEN managed_native_deliveries.attempts ELSE 0 END,
      target_channel_id=coalesce(managed_native_deliveries.discord_channel_id,excluded.target_channel_id),available_at=now(),error_code=NULL`;
}

export function nativeDiscordChannel(
  sector: string,
  offer: string | null = null,
  companyId?: string | null,
): string | null {
  try {
    const channels = JSON.parse(env.TASK_DISCORD_CHANNELS_JSON);
    const prefix = companyId ? `${companyId}:` : '';
    const id =
      (offer ? channels[`${prefix}${sector}:${offer}`] : null) ?? channels[`${prefix}${sector}`];
    return typeof id === 'string' && /^\d+$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

async function persistTask(
  tx: TransactionSql,
  task: ManagedTask,
  key: string,
  actor: Actor,
  action: string,
  previous: ManagedTask | null,
) {
  await tx`INSERT INTO managed_tasks(id,body,updated_at) VALUES(${task.id},${tx.json(task)},${task.updatedAt}) ON CONFLICT(id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at`;
  await tx`INSERT INTO managed_task_events(event_id,task_id,body) VALUES(${`native:${key}`},${task.id},${tx.json({ actorId: actor.id, action, previous, task })})`;
  await queueNativeDelivery(tx, task);
  return { kind: 'task' as const, id: task.id, result: task };
}

export async function createNativeTask(
  db: Sql,
  key: string,
  actor: Actor,
  input: TaskFields & { sector: string; offer: string | null; companyId?: string | null },
  source: 'tmx' | 'discord' = 'tmx',
) {
  return nativeRequest(db, key, actor, 'task.create', { ...input, source }, async (tx) => {
    await assertOperationCompany(tx, actor, input.companyId);
    const people = await nativePeople(tx, input.assigneeIds, input.companyId);
    const at = new Date().toISOString();
    const { assigneeIds: _ids, ...fields } = input;
    const task: ManagedTask = {
      ...fields,
      id: randomUUID(),
      managementMode: 'native',
      revision: 1,
      clickupId: null,
      discordMessageId: null,
      discordChannelId: null,
      assignees: people,
      status: 'pending',
      source,
      receivedAt: at,
      assignedAt: at,
      assignmentReceivedAt: Object.fromEntries(people.map((p) => [p.id, at])),
      startedAt: null,
      completedAt: null,
      updatedAt: at,
      syncState: 'synced',
      discordState: 'pending',
    };
    return persistTask(tx, task, key, actor, 'created', null);
  });
}

async function assertTaskAssignment(tx: TransactionSql, actor: Actor, task: ManagedTask) {
  if (
    !task.assignees.some((p) => p.userId === actor.id) ||
    (!actor.admin && !(await participantHasCompanyAccess(tx, actor.id, task.companyId)))
  )
    throw problem(403, 'task_assignment_required', 'Esta tarefa não está atribuída à sua conta.');
}

async function editableTask(
  tx: TransactionSql,
  id: string,
  revision: number,
  actor: Actor,
  participantStatus = false,
) {
  const [row] =
    await tx`SELECT t.body FROM managed_tasks t WHERE t.id=${id} AND t.body->>'managementMode'='native' FOR UPDATE OF t`;
  if (!row) throw problem(404, 'task_not_found', 'Tarefa não encontrada para sua conta.');
  const task = row.body as ManagedTask;
  if (actor.requireAssignment) await assertTaskAssignment(tx, actor, task);
  await assertOperationAccess(
    tx,
    actor,
    task.companyId,
    participantStatus ? task.assignees.flatMap((p) => (p.userId ? [p.userId] : [])) : [],
  );
  if (task.revision !== revision)
    throw problem(409, 'task_revision_conflict', 'A tarefa mudou. Atualize antes de continuar.');
  return task;
}

export async function changeNativeTaskStatus(
  db: Sql,
  key: string,
  actor: Actor,
  id: string,
  status: TaskStatus,
  revision: number,
) {
  return nativeRequest(db, key, actor, 'task.status', { id, status, revision }, async (tx) => {
    const previous = await editableTask(tx, id, revision, actor, true);
    const at = new Date().toISOString();
    const task = {
      ...previous,
      status,
      revision: revision + 1,
      updatedAt: at,
      discordState: 'pending' as const,
      startedAt: status === 'progress' ? (previous.startedAt ?? at) : previous.startedAt,
      completedAt: status === 'done' ? (previous.completedAt ?? at) : null,
    };
    return persistTask(tx, task, key, actor, 'status', previous);
  });
}

export async function editNativeTask(
  db: Sql,
  key: string,
  actor: Actor,
  id: string,
  input: TaskFields & { revision: number },
) {
  return nativeRequest(db, key, actor, 'task.edit', { id, ...input }, async (tx) => {
    const previous = await editableTask(tx, id, input.revision, actor);
    const people = await nativePeople(tx, input.assigneeIds, previous.companyId);
    const at = new Date().toISOString();
    const { assigneeIds: _ids, ...fields } = input;
    const task = {
      ...previous,
      ...fields,
      revision: input.revision + 1,
      assignees: people,
      assignmentReceivedAt: Object.fromEntries(
        people.map((p) => [p.id, previous.assignmentReceivedAt[p.id] ?? at]),
      ),
      updatedAt: at,
      discordState: 'pending' as const,
    };
    return persistTask(tx, task, key, actor, 'edited', previous);
  });
}
