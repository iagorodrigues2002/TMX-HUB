import { randomUUID } from 'node:crypto';
import {
  type ManagedCall,
  type ManagedTask,
  TaskCreateSchema,
  TaskStatusSchema,
} from '@page-cloner/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import {
  assertCompanyPeople,
  operationScope,
  participantHasCompanyAccess,
} from '../lib/company-operation-access.js';
import { HttpProblem, zodToProblem } from '../lib/problem.js';
import { processNativeCallNotices } from '../services/native-calls.js';
import {
  changeNativeTaskStatus,
  createNativeTask,
  nativeDiscordChannel,
} from '../services/native-tasks.js';
import { validTaskBridgeSecret } from './task-management.js';

const problem = (status: number, code: string, detail: string) =>
  new HttpProblem({ status, code, title: code, detail });
const ResultSchema = z
  .object({
    id: z.string().min(1).max(200),
    leaseId: z.string().uuid(),
    revision: z.number().int().min(1),
    outcome: z.enum(['confirmed', 'retryable', 'uncertain', 'permanent']),
    messageId: z.string().regex(/^\d+$/).optional(),
    channelId: z.string().regex(/^\d+$/).optional(),
    retryAfterMs: z.number().int().min(0).max(600000).optional(),
  })
  .strict();

export async function nativeTaskAutomationRoutes(app: FastifyInstance) {
  async function discordActor(id: string) {
    const people =
      await app.db!`SELECT body FROM managed_task_people WHERE body->>'discordId'=${id} LIMIT 2`;
    if (people.length !== 1 || !people[0]!.body.userId)
      throw problem(403, 'discord_actor_unmapped', 'Vincule o responsável à conta TMX.');
    const user = await app.userStore.maybeGetById(people[0]!.body.userId);
    if (!user) throw problem(403, 'discord_actor_unmapped', 'Conta TMX não encontrada.');
    return user;
  }
  let timer: ReturnType<typeof setInterval> | undefined;
  let running: Promise<unknown> | null = null;
  app.addHook('onReady', async () => {
    if (env.TASK_MANAGEMENT_MODE !== 'native' || !app.db) return;
    timer = setInterval(() => {
      if (running) return;
      running = processNativeCallNotices(app.db!)
        .catch(() => app.log.error('Native call reminder scan failed'))
        .finally(() => {
          running = null;
        });
    }, 15000);
    timer.unref();
  });
  app.addHook('onClose', async () => {
    if (timer) clearInterval(timer);
    await running;
  });
  app.addHook('preHandler', async (req) => {
    if (!validTaskBridgeSecret(req.headers['x-tmx-task-secret'], env.TASK_AUTOMATION_SECRET))
      throw problem(401, 'unauthorized', 'Credencial de automação inválida.');
    if (env.TASK_MANAGEMENT_MODE !== 'native')
      throw problem(409, 'native_mode_required', 'Gestão nativa não ativada.');
    if (!app.db) throw problem(503, 'task_database_unavailable', 'Banco de tarefas indisponível.');
  });
  app.post('/native-task-automation/claim', async () => {
    await processNativeCallNotices(app.db!);
    // Finish cleanup before acquiring entity locks, preserving a consistent lock order.
    await app.db!`UPDATE managed_native_deliveries SET state='uncertain',error_code='lease_expired' WHERE state='processing' AND lease_expires_at<now()`;
    await app.db!`UPDATE managed_native_deliveries SET state='expired' WHERE entity_kind='reminder' AND state='queued' AND expires_at<now()`;
    await app.db!`UPDATE managed_native_deliveries SET state='failed',error_code='channel_unconfigured' WHERE state='queued' AND target_channel_id IS NULL`;
    return app.db!.begin(async (tx) => {
      const candidates =
        await tx`SELECT id,entity_id,entity_kind FROM managed_native_deliveries WHERE state='queued' AND available_at<=now() ORDER BY available_at,id LIMIT 10`;
      const deliveries = [];
      for (const candidate of candidates) {
        const [entity] =
          candidate.entity_kind === 'task'
            ? await tx`SELECT body FROM managed_tasks WHERE id=${candidate.entity_id} AND body->>'managementMode'='native' FOR UPDATE SKIP LOCKED`
            : await tx`SELECT body FROM managed_calls WHERE id=${candidate.entity_id} AND body->>'managementMode'='native' FOR UPDATE SKIP LOCKED`;
        if (!entity) continue;
        const [row] =
          await tx`SELECT * FROM managed_native_deliveries WHERE id=${candidate.id} AND state='queued' AND available_at<=now() FOR UPDATE SKIP LOCKED`;
        if (!row) continue;
        const currentEntity = entity.body as ManagedTask | ManagedCall;
        const people =
          'assignees' in currentEntity ? currentEntity.assignees : currentEntity.participants;
        const channel =
          'sector' in currentEntity
            ? nativeDiscordChannel(
                currentEntity.sector,
                currentEntity.offer,
                currentEntity.companyId,
              )
            : nativeDiscordChannel('Calls', null, currentEntity.companyId);
        if (currentEntity.companyId && (!channel || row.target_channel_id !== channel)) {
          await tx`UPDATE managed_native_deliveries SET state='failed',error_code='company_channel_mismatch' WHERE id=${row.id}`;
          continue;
        }
        try {
          await assertCompanyPeople(tx, currentEntity.companyId, people);
          if (
            !currentEntity.companyId &&
            !(
              await Promise.all(
                people.map((p) =>
                  p.userId
                    ? participantHasCompanyAccess(tx, p.userId, null)
                    : Promise.resolve(false),
                ),
              )
            ).every(Boolean)
          )
            throw problem(
              403,
              'company_scope_required',
              'Vincule o registro à empresa antes de enviar.',
            );
        } catch (error) {
          if (!(error instanceof HttpProblem) || error.status !== 403) throw error;
          await tx`UPDATE managed_native_deliveries SET state='failed',error_code='company_recipient_revoked' WHERE id=${row.id}`;
          continue;
        }
        if (
          row.entity_kind === 'reminder' &&
          (entity.body.status !== 'scheduled' || row.revision !== entity.body.revision)
        ) {
          await tx`UPDATE managed_native_deliveries SET state='expired' WHERE id=${row.id}`;
          continue;
        }
        const leaseId = randomUUID();
        await tx`UPDATE managed_native_deliveries SET state='processing',attempts=attempts+1,claimed_revision=revision,lease_id=${leaseId},lease_expires_at=now()+interval '2 minutes',last_result=NULL WHERE id=${row.id}`;
        deliveries.push({
          id: row.id,
          leaseId,
          revision: row.revision,
          entityKind: row.entity_kind,
          body: row.body,
          messageId: row.discord_message_id,
          channelId: row.target_channel_id,
        });
        if (deliveries.length === 5) break;
      }
      return { deliveries };
    });
  });
  app.post('/native-task-automation/result', async (req) => {
    const parsed = ResultSchema.safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const input = parsed.data;
    return app.db!.begin(async (tx) => {
      const [identity] =
        await tx`SELECT entity_kind,entity_id FROM managed_native_deliveries WHERE id=${input.id}`;
      if (!identity) throw problem(404, 'delivery_not_found', 'Entrega não encontrada.');
      // Match the mutation lock order: entity first, projection second.
      const [entity] =
        identity.entity_kind === 'task'
          ? await tx`SELECT body FROM managed_tasks WHERE id=${identity.entity_id} AND body->>'managementMode'='native' FOR UPDATE`
          : await tx`SELECT body FROM managed_calls WHERE id=${identity.entity_id} AND body->>'managementMode'='native' FOR UPDATE`;
      if (!entity)
        throw problem(
          409,
          'delivery_entity_conflict',
          'Entrega não corresponde a uma tarefa nativa.',
        );
      const [row] =
        await tx`SELECT * FROM managed_native_deliveries WHERE id=${input.id} FOR UPDATE`;
      if (!row) throw problem(404, 'delivery_not_found', 'Entrega não encontrada.');
      if (row.lease_id !== input.leaseId || row.claimed_revision !== input.revision)
        throw problem(409, 'delivery_lease_conflict', 'Reserva de entrega não corresponde.');
      if (row.last_result) {
        if (
          JSON.stringify(Object.entries(row.last_result).sort()) !==
          JSON.stringify(Object.entries(input).sort())
        )
          throw problem(409, 'delivery_result_conflict', 'Recibo repetido com dados diferentes.');
        return { accepted: true, duplicate: true };
      }
      if (!['processing', 'uncertain'].includes(row.state))
        throw problem(409, 'delivery_not_reserved', 'Entrega não está reservada.');
      const task = entity.body as ManagedTask | ManagedCall;
      const current = row.revision === input.revision && task.revision === input.revision;
      let state: string;
      if (input.outcome === 'confirmed') {
        if (
          !input.messageId ||
          !input.channelId ||
          input.channelId !== row.target_channel_id ||
          (row.discord_message_id && row.discord_message_id !== input.messageId)
        )
          throw problem(
            409,
            'discord_receipt_conflict',
            'Discord não confirmou a mensagem e o canal esperados.',
          );
        state = current || identity.entity_kind === 'reminder' ? 'succeeded' : 'queued';
        if (identity.entity_kind !== 'reminder') {
          task.discordMessageId = input.messageId;
          task.discordChannelId = input.channelId;
          task.discordState = current ? 'synced' : 'pending';
        }
      } else {
        state =
          input.outcome === 'uncertain'
            ? 'uncertain'
            : input.outcome === 'retryable' && row.attempts < 3
              ? 'queued'
              : 'failed';
        task.discordState = state === 'failed' || state === 'uncertain' ? 'failed' : 'pending';
      }
      if (identity.entity_kind === 'task')
        await tx`UPDATE managed_tasks SET body=${tx.json(task)} WHERE id=${task.id}`;
      else if (identity.entity_kind === 'call')
        await tx`UPDATE managed_calls SET body=${tx.json(task)} WHERE id=${task.id}`;
      await tx`UPDATE managed_native_deliveries SET state=${state},last_result=${tx.json(input)},lease_expires_at=NULL,
        discord_message_id=coalesce(${input.outcome === 'confirmed' ? (input.messageId ?? null) : null},discord_message_id),discord_channel_id=coalesce(${input.outcome === 'confirmed' ? (input.channelId ?? null) : null},discord_channel_id),
        delivered_at=CASE WHEN ${input.outcome}='confirmed' THEN now() ELSE delivered_at END,
        available_at=CASE WHEN ${input.outcome}='retryable' THEN now()+(${input.retryAfterMs ?? Math.min(60000, 1000 * 2 ** row.attempts)} * interval '1 millisecond') ELSE now() END,
        error_code=CASE WHEN ${input.outcome}='confirmed' THEN NULL ELSE ${input.outcome} END WHERE id=${input.id}`;
      return { accepted: true, duplicate: false };
    });
  });
  app.post('/native-task-automation/interaction', async (req) => {
    const parsed = z
      .object({
        interactionId: z.string().regex(/^\d+$/),
        taskId: z.string().uuid(),
        actorDiscordId: z.string().regex(/^\d+$/),
        messageId: z.string().regex(/^\d+$/),
        channelId: z.string().regex(/^\d+$/),
        revision: z.number().int().min(1),
        status: TaskStatusSchema,
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const input = parsed.data;
    const user = await discordActor(input.actorDiscordId);
    const [task] =
      await app.db!`SELECT id FROM managed_tasks WHERE id=${input.taskId} AND body->>'managementMode'='native'
      AND body->>'discordMessageId'=${input.messageId} AND body->>'discordChannelId'=${input.channelId}`;
    if (!task) throw problem(404, 'task_not_found', 'Card não corresponde à tarefa nativa.');
    return changeNativeTaskStatus(
      app.db!,
      `discord:${input.interactionId}`,
      { id: user.id, admin: user.role === 'admin' },
      input.taskId,
      input.status,
      input.revision,
    );
  });
  app.post('/native-task-automation/create', async (req, reply) => {
    const parsed = z
      .object({
        messageId: z.string().regex(/^\d+$/),
        actorDiscordId: z.string().regex(/^\d+$/),
        task: TaskCreateSchema,
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const user = await discordActor(parsed.data.actorDiscordId);
    if (!parsed.data.task.companyId)
      throw problem(400, 'company_required', 'Informe a empresa da nova tarefa.');
    await operationScope(
      app.db!,
      { id: user.id, admin: user.role === 'admin' },
      parsed.data.task.companyId,
    );
    return reply
      .code(201)
      .send(
        await createNativeTask(
          app.db!,
          `discord-create:${parsed.data.messageId}`,
          { id: user.id, admin: user.role === 'admin' },
          parsed.data.task,
          'discord',
        ),
      );
  });
  app.get('/native-task-automation/people', async () => ({
    people: (
      await app.db!`SELECT body FROM managed_task_people WHERE body->>'userId' IS NOT NULL ORDER BY body->>'name'`
    ).map((r) => ({
      id: r.body.id,
      name: r.body.name,
      userId: r.body.userId,
      discordId: r.body.discordId,
    })),
  }));
}
