import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import {
  type ManagedTask,
  type TaskCommand,
  TaskCreateSchema,
  TaskEventSchema,
  type TaskPerson,
  TaskPersonSchema,
  TaskStatusSchema,
} from '@page-cloner/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { HttpProblem, zodToProblem } from '../lib/problem.js';

const problem = (status: number, code: string, detail: string) =>
  new HttpProblem({ status, code, title: code, detail });
const idSchema = z.string().uuid();
function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, stableValue(entry)]),
    );
  return value;
}
const hash = (value: unknown) =>
  createHash('sha256')
    .update(JSON.stringify(stableValue(value)))
    .digest('hex');

export function validTaskBridgeSecret(provided: unknown, expected: string | undefined) {
  if (typeof provided !== 'string' || !expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function taskManagementRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    if (!req.user) throw problem(401, 'unauthorized', 'Entre na sua conta.');
    if (req.user.role !== 'admin')
      throw problem(403, 'admin_required', 'Área exclusiva para administradores.');
    if (!app.db) throw problem(503, 'task_database_unavailable', 'Banco de tarefas indisponível.');
  });

  app.get('/tasks', async (req) => {
    const parsed = z
      .object({
        page: z.coerce.number().int().min(1).default(1),
        limit: z.coerce.number().int().min(1).max(100).default(50),
        person: z.union([idSchema, z.literal('all')]).default('all'),
        status: z.enum(['all', 'pending', 'progress', 'done', 'overdue']).default('all'),
        q: z.string().max(200).default(''),
      })
      .strict()
      .safeParse(req.query);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const { page, limit, person, status, q } = parsed.data;
    const db = app.db!;
    const [rows, counts, summary, perPerson] = await Promise.all([
      // The resilient client executes tagged queries eagerly; WHERE cannot be a separate fragment.
      db`SELECT body FROM managed_tasks
        WHERE (${person}='all' OR body->'assignees' @> ${db.json([{ id: person }])})
        AND (${status}='all' OR body->>'status'=${status} OR (${status}='overdue' AND body->>'status'<>'done' AND (body->>'dueAt')::timestamptz < now()))
        AND (${q}='' OR strpos(lower((body->>'title') || ' ' || (body->>'sector') || ' ' || coalesce(body->>'offer','')),lower(${q}))>0
          OR EXISTS (SELECT 1 FROM jsonb_array_elements(body->'assignees') assignee WHERE strpos(lower(assignee->>'name'),lower(${q}))>0))
        ORDER BY updated_at DESC,id LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      db`SELECT count(*) AS total FROM managed_tasks
        WHERE (${person}='all' OR body->'assignees' @> ${db.json([{ id: person }])})
        AND (${status}='all' OR body->>'status'=${status} OR (${status}='overdue' AND body->>'status'<>'done' AND (body->>'dueAt')::timestamptz < now()))
        AND (${q}='' OR strpos(lower((body->>'title') || ' ' || (body->>'sector') || ' ' || coalesce(body->>'offer','')),lower(${q}))>0
          OR EXISTS (SELECT 1 FROM jsonb_array_elements(body->'assignees') assignee WHERE strpos(lower(assignee->>'name'),lower(${q}))>0))`,
      db`SELECT count(*) FILTER(WHERE body->>'status'<>'done')::int AS open, count(*) FILTER(WHERE body->>'status'='progress')::int AS progress, count(*) FILTER(WHERE body->>'status'='done')::int AS done, count(*) FILTER(WHERE body->>'status'<>'done' AND (body->>'dueAt')::timestamptz<now())::int AS overdue FROM managed_tasks`,
      db`SELECT person->>'id' AS id, count(*) FILTER(WHERE body->>'status'<>'done')::int AS open, count(*) FILTER(WHERE body->>'status'='progress')::int AS progress, count(*) FILTER(WHERE body->>'status'='done')::int AS done, count(*) FILTER(WHERE body->>'status'<>'done' AND (body->>'dueAt')::timestamptz<now())::int AS overdue FROM managed_tasks CROSS JOIN LATERAL jsonb_array_elements(body->'assignees') person GROUP BY person->>'id'`,
    ]);
    return {
      tasks: rows.map((row) => row.body),
      total: Number(counts[0]?.total ?? 0),
      summary: summary[0],
      peopleSummary: perPerson,
      page,
      limit,
      configured: !!env.TASK_AUTOMATION_SECRET,
    };
  });
  app.get('/tasks/people', async () => ({
    people: (await app.db!`SELECT body FROM managed_task_people ORDER BY body->>'name',id`).map(
      (row) => row.body,
    ),
  }));
  app.post('/tasks/people', async (req, reply) => {
    const parsed = TaskPersonSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const p = parsed.data;
    if (p.userId && !(await app.userStore.getById(p.userId)))
      throw problem(400, 'unknown_tmx_user', 'Selecione um usuário TMX existente.');
    if (p.userId) {
      const linked =
        await app.db!`SELECT id FROM managed_task_people WHERE body->>'userId'=${p.userId} AND id<>${p.id} LIMIT 1`;
      if (linked.length)
        throw problem(
          409,
          'person_identity_conflict',
          'Esta conta TMX já está vinculada a outra pessoa.',
        );
    }
    try {
      await app.db!`INSERT INTO managed_task_people(id,clickup_id,discord_id,body) VALUES(${p.id},${p.clickupId},${p.discordId},${app.db!.json(p)}) ON CONFLICT(id) DO UPDATE SET clickup_id=excluded.clickup_id,discord_id=excluded.discord_id,body=excluded.body`;
    } catch (error) {
      if ((error as { code?: string }).code === '23505')
        throw problem(
          409,
          'person_identity_conflict',
          'Este ID do ClickUp ou Discord já está vinculado a outra pessoa.',
        );
      throw error;
    }
    return reply.code(201).send(p);
  });
  app.post('/tasks', async (req, reply) => {
    const parsed = TaskCreateSchema.safeParse(req.body);
    const key = idSchema.safeParse(req.headers['idempotency-key']);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    if (!key.success)
      throw problem(400, 'idempotency_required', 'Envie uma chave estável de criação.');
    if (!env.TASK_AUTOMATION_SECRET)
      throw problem(
        503,
        'task_automation_unconfigured',
        'Configure a automação antes de criar tarefas reais.',
      );
    const input = parsed.data;
    const requestHash = hash(input);
    const result = await app.db!.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${key.data}))`;
      const [existing] =
        await tx`SELECT user_id,request_hash,task_id FROM managed_task_commands WHERE id=${key.data}`;
      if (existing) {
        if (existing.user_id !== req.user!.sub || existing.request_hash !== requestHash)
          throw problem(409, 'idempotency_conflict', 'Chave já utilizada em outra operação.');
        const [saved] = await tx`SELECT body FROM managed_tasks WHERE id=${existing.task_id}`;
        return saved!.body;
      }
      const people =
        await tx`SELECT body FROM managed_task_people WHERE id IN ${tx(input.assigneeIds)}`;
      if (people.length !== input.assigneeIds.length || people.some((p) => !p.body.clickupId))
        throw problem(
          400,
          'assignee_unmapped',
          'Todos os responsáveis precisam ter vínculo com o ClickUp.',
        );
      const at = new Date().toISOString();
      const task: ManagedTask = {
        id: randomUUID(),
        clickupId: null,
        discordMessageId: null,
        discordChannelId: null,
        title: input.title,
        description: input.description,
        sector: input.sector,
        offer: input.offer,
        assignees: people.map((p) => p.body as TaskPerson),
        status: 'pending',
        priority: input.priority,
        source: 'tmx',
        receivedAt: at,
        assignedAt: null,
        assignmentReceivedAt: {},
        startedAt: null,
        completedAt: null,
        dueAt: input.dueAt,
        updatedAt: at,
        syncState: 'queued',
        discordState: 'pending',
      };
      const command: TaskCommand = { id: key.data, taskId: task.id, action: 'create', task };
      await tx`INSERT INTO managed_tasks(id,body) VALUES(${task.id},${tx.json(task)})`;
      await tx`INSERT INTO managed_task_commands(id,user_id,request_hash,task_id,body) VALUES(${key.data},${req.user!.sub},${requestHash},${task.id},${tx.json(command)})`;
      return task;
    });
    return reply.code(202).send(result);
  });
  app.patch('/tasks/:id/status', async (req, reply) => {
    const params = z.object({ id: idSchema }).safeParse(req.params);
    const parsed = z.object({ status: TaskStatusSchema }).strict().safeParse(req.body);
    const key = idSchema.safeParse(req.headers['idempotency-key']);
    if (!params.success || !parsed.success || !key.success)
      throw problem(400, 'invalid_task_status', 'Status, tarefa ou chave inválidos.');
    if (!env.TASK_AUTOMATION_SECRET)
      throw problem(503, 'task_automation_unconfigured', 'Automação ainda não configurada.');
    await app.db!.begin(async (tx) => {
      const [row] = await tx`SELECT body FROM managed_tasks WHERE id=${params.data.id} FOR UPDATE`;
      if (!row) throw problem(404, 'task_not_found', 'Tarefa não encontrada.');
      const task = row.body as ManagedTask;
      if (!task.clickupId || !task.discordMessageId || !task.discordChannelId)
        throw problem(
          409,
          'task_not_synced',
          'Aguarde a confirmação e o vínculo da mensagem Discord.',
        );
      const requestHash = hash({ taskId: task.id, status: parsed.data.status });
      const [existing] =
        await tx`SELECT user_id,request_hash FROM managed_task_commands WHERE id=${key.data}`;
      if (existing) {
        if (existing.user_id !== req.user!.sub || existing.request_hash !== requestHash)
          throw problem(409, 'idempotency_conflict', 'Chave já utilizada.');
        return;
      }
      if (
        (
          await tx`SELECT id FROM managed_task_commands WHERE task_id=${task.id} AND state IN ('queued','processing')`
        ).length
      )
        throw problem(409, 'task_busy', 'Existe uma alteração aguardando confirmação.');
      const command: TaskCommand = {
        id: key.data,
        taskId: task.id,
        action: 'status',
        status: parsed.data.status,
        task,
      };
      await tx`INSERT INTO managed_task_commands(id,user_id,request_hash,task_id,body) VALUES(${key.data},${req.user!.sub},${requestHash},${task.id},${tx.json(command)})`;
      await tx`UPDATE managed_tasks SET body=jsonb_set(body,'{syncState}','"queued"'),updated_at=now() WHERE id=${task.id}`;
    });
    return reply.code(202).send({ queued: true });
  });
  app.get('/tasks/:id/history', async (req) => {
    const parsed = z.object({ id: idSchema }).safeParse(req.params);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    return {
      events:
        await app.db!`SELECT event_id,body,received_at FROM managed_task_events WHERE task_id=${parsed.data.id} ORDER BY received_at DESC LIMIT 100`,
    };
  });
}

// Separate from session routes: a dedicated server-only n8n credential, never a browser token.
export async function taskAutomationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    if (!validTaskBridgeSecret(req.headers['x-tmx-task-secret'], env.TASK_AUTOMATION_SECRET))
      throw problem(401, 'unauthorized', 'Credencial de automação inválida.');
    if (!app.db) throw problem(503, 'task_database_unavailable', 'Banco de tarefas indisponível.');
  });
  app.get('/task-automation/people', async () => ({
    people: (await app.db!`SELECT body FROM managed_task_people ORDER BY id`).map(
      (row) => row.body,
    ),
  }));
  app.get('/task-automation/tasks/lookup', async (req) => {
    const parsed = z
      .object({ clickupId: z.string().regex(/^[a-zA-Z0-9_-]+$/), requestId: idSchema.optional() })
      .strict()
      .safeParse(req.query);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const { clickupId, requestId } = parsed.data;
    const [row] =
      await app.db!`SELECT t.body FROM managed_tasks t LEFT JOIN managed_task_commands c ON c.task_id=t.id WHERE t.clickup_id=${clickupId} OR c.id=${requestId ?? ''} ORDER BY t.updated_at DESC LIMIT 1`;
    return { task: row?.body ?? null };
  });
  app.post('/task-automation/commands/claim', async () => {
    const rows =
      await app.db!`UPDATE managed_task_commands SET state='processing',claimed_at=now() WHERE id IN (SELECT id FROM managed_task_commands WHERE state='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 5) RETURNING body`;
    return { commands: rows.map((row) => row.body) };
  });
  app.post('/task-automation/events', async (req) => {
    const parsed = TaskEventSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const event = parsed.data;
    if (!event.task.clickupId)
      throw problem(400, 'clickup_id_required', 'Confirme o identificador real do ClickUp.');
    return app.db!.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${event.task.clickupId!}))`;
      const [duplicate] =
        await tx`SELECT body FROM managed_task_events WHERE event_id=${event.eventId}`;
      if (duplicate) {
        if (hash(duplicate.body) !== hash(event))
          throw problem(409, 'event_conflict', 'Evento repetido com dados diferentes.');
        return {
          accepted: true,
          duplicate: true,
          taskId:
            duplicate.body.task.id ??
            (await tx`SELECT id FROM managed_tasks WHERE clickup_id=${event.task.clickupId}`)[0]
              ?.id,
        };
      }
      const matches =
        await tx`SELECT id,body FROM managed_tasks WHERE id=${event.task.id ?? ''} OR clickup_id=${event.task.clickupId} FOR UPDATE`;
      const existing = matches[0];
      if (
        matches.length > 1 ||
        (existing?.body.clickupId && existing.body.clickupId !== event.task.clickupId)
      )
        throw problem(
          409,
          'task_identity_conflict',
          'Identificadores pertencem a tarefas diferentes.',
        );
      const task = {
        ...event.task,
        id: existing?.id ?? event.task.id ?? randomUUID(),
        receivedAt: existing?.body.receivedAt ?? new Date().toISOString(),
      };
      const people =
        await tx`SELECT body FROM managed_task_people WHERE id IN ${tx(task.assignees.length ? task.assignees.map((p) => p.id) : [''])}`;
      if (people.length !== task.assignees.length)
        throw problem(400, 'assignee_unmapped', 'Responsável não cadastrado no TMX.');
      task.assignees = people.map((p) => p.body as TaskPerson);
      if (
        event.task.assignees.some(
          (p) =>
            !task.assignees.some((saved) => saved.id === p.id && saved.clickupId === p.clickupId),
        )
      )
        throw problem(
          409,
          'assignee_changed',
          'O vínculo de um responsável mudou. Confira a tarefa antes de sincronizar.',
        );
      const receivedNow = new Date().toISOString();
      task.assignmentReceivedAt = Object.fromEntries(
        task.assignees.map((person) => [
          person.id,
          existing?.body.assignees?.some((p: TaskPerson) => p.id === person.id)
            ? (existing.body.assignmentReceivedAt?.[person.id] ?? receivedNow)
            : receivedNow,
        ]),
      );
      task.assignedAt ??= existing?.body.assignedAt ?? null;
      task.startedAt ??= existing?.body.startedAt ?? null;
      const newer = !existing || Date.parse(task.updatedAt) >= Date.parse(existing.body.updatedAt);
      if (
        existing?.body.updatedAt === task.updatedAt &&
        existing.body.discordState === 'synced' &&
        task.discordState === 'pending'
      ) {
        task.discordState = 'synced';
        task.discordMessageId = existing.body.discordMessageId;
        task.discordChannelId = existing.body.discordChannelId;
      }
      if (newer)
        await tx`INSERT INTO managed_tasks(id,clickup_id,body,updated_at) VALUES(${task.id},${task.clickupId},${tx.json(task)},${task.updatedAt}) ON CONFLICT(id) DO UPDATE SET clickup_id=excluded.clickup_id,body=excluded.body,updated_at=excluded.updated_at`;
      await tx`INSERT INTO managed_task_events(event_id,task_id,body) VALUES(${event.eventId},${task.id},${tx.json(event)})`;
      if (
        newer &&
        task.syncState === 'synced' &&
        task.discordState === 'synced' &&
        task.discordMessageId &&
        task.discordChannelId
      ) {
        const pending =
          await tx`SELECT id,body FROM managed_task_commands WHERE task_id=${task.id} AND state='processing' FOR UPDATE`;
        const actual = task.assignees.map((p) => p.clickupId).sort();
        for (const row of pending) {
          const command = row.body as TaskCommand;
          const expected = command.task.assignees.map((p) => p.clickupId).sort();
          if (JSON.stringify(actual) !== JSON.stringify(expected)) continue;
          if (
            command.action === 'status' &&
            (command.task.clickupId !== task.clickupId || command.status !== task.status)
          )
            continue;
          await tx`UPDATE managed_task_commands SET state='succeeded',finished_at=now() WHERE id=${row.id}`;
        }
      }
      return { accepted: true, duplicate: false, stale: !newer, taskId: task.id };
    });
  });
  app.post('/task-automation/commands/:id/result', async (req) => {
    const params = z.object({ id: idSchema }).safeParse(req.params);
    const parsed = z.object({ success: z.boolean() }).strict().safeParse(req.body);
    if (!params.success || !parsed.success)
      throw problem(400, 'invalid_result', 'Resultado inválido.');
    await app.db!.begin(async (tx) => {
      const [command] =
        await tx`SELECT task_id,state FROM managed_task_commands WHERE id=${params.data.id} FOR UPDATE`;
      if (!command) throw problem(404, 'command_not_found', 'Operação não encontrada.');
      if (command.state === 'succeeded' || command.state === 'failed') return;
      if (parsed.data.success) {
        const [task] = await tx`SELECT body FROM managed_tasks WHERE id=${command.task_id}`;
        const [intent] =
          await tx`SELECT body FROM managed_task_commands WHERE id=${params.data.id}`;
        if (
          task?.body.syncState !== 'synced' ||
          task?.body.discordState !== 'synced' ||
          !task?.body.clickupId ||
          !task?.body.discordMessageId ||
          !task?.body.discordChannelId ||
          (intent?.body.action === 'status' && task.body.status !== intent.body.status)
        )
          throw problem(
            409,
            'confirmation_required',
            'Persista primeiro a confirmação ClickUp/Discord desta operação.',
          );
      }
      await tx`UPDATE managed_task_commands SET state=${parsed.data.success ? 'succeeded' : 'failed'},finished_at=now() WHERE id=${params.data.id}`;
      if (!parsed.data.success)
        await tx`UPDATE managed_tasks SET body=jsonb_set(body,'{syncState}','"failed"'),updated_at=now() WHERE id=${command.task_id}`;
    });
    return { accepted: true };
  });
}
