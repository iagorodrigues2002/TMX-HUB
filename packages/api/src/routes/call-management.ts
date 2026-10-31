import { createHash, randomUUID } from 'node:crypto';
import { CallCreateSchema, type ManagedCall, type TaskPerson } from '@page-cloner/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { HttpProblem, zodToProblem } from '../lib/problem.js';
import { validTaskBridgeSecret } from './task-management.js';

const problem = (status: number, code: string, detail: string) =>
  new HttpProblem({ status, code, title: code, detail });
const uuid = z.string().uuid();
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const admin = (user: { role: string } | undefined) => {
  if (user?.role !== 'admin')
    throw problem(403, 'admin_required', 'Área exclusiva para administradores.');
};
export async function callManagementRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    if (!req.user) throw problem(401, 'unauthorized', 'Entre na sua conta.');
    if (!app.db) throw problem(503, 'call_database_unavailable', 'Banco de calls indisponível.');
  });
  app.get('/calls/notifications', async (req) => ({
    notifications: (
      await app.db!`SELECT n.id,n.body,n.received_at FROM managed_call_notifications n JOIN managed_calls c ON c.id=n.call_id WHERE n.user_id=${req.user!.sub} AND n.read_at IS NULL AND n.revision=(c.body->>'revision')::int AND c.body->>'status'='scheduled' AND (c.body->>'startsAt')::timestamptz + ((c.body->>'durationMinutes')::int * interval '1 minute')>now() ORDER BY n.received_at DESC LIMIT 50`
    ).map((r) => ({ id: r.id, ...r.body, receivedAt: r.received_at })),
  }));
  app.post('/calls/notifications/:id/read', async (req) => {
    const parsed = z
      .object({ id: z.string().min(1).max(200) })
      .strict()
      .safeParse(req.params);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    await app.db!`UPDATE managed_call_notifications SET read_at=now() WHERE id=${parsed.data.id} AND user_id=${req.user!.sub}`;
    return { read: true };
  });
  app.get('/calls', async (req) => {
    admin(req.user);
    const parsed = z
      .object({ status: z.enum(['all', 'scheduled', 'completed', 'cancelled']).default('all') })
      .strict()
      .safeParse(req.query);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const rows =
      await app.db!`SELECT body FROM managed_calls WHERE (${parsed.data.status}='all' OR body->>'status'=${parsed.data.status}) ORDER BY (body->>'startsAt')::timestamptz DESC LIMIT 200`;
    return { calls: rows.map((r) => r.body), total: rows.length };
  });
  for (const action of ['create', 'update', 'cancel', 'complete'] as const) {
    const method = action === 'update' ? 'PUT' : 'POST';
    const url =
      action === 'create' ? '/calls' : action === 'update' ? '/calls/:id' : `/calls/:id/${action}`;
    app.route({
      method,
      url,
      handler: async (req, reply) => {
        admin(req.user);
        if (!env.TASK_AUTOMATION_SECRET)
          throw problem(
            503,
            'call_automation_unconfigured',
            'Configure a automação antes de cadastrar calls.',
          );
        const key = uuid.safeParse(req.headers['idempotency-key']);
        const params = z.object({ id: uuid }).safeParse(req.params);
        const parsed = (
          action === 'create'
            ? CallCreateSchema
            : action === 'update'
              ? CallCreateSchema.extend({ revision: z.number().int().min(1) })
              : z.object({ revision: z.number().int().min(1) }).strict()
        ).safeParse(req.body);
        if (!key.success || (action !== 'create' && !params.success) || !parsed.success)
          throw problem(400, 'invalid_call', 'Confira os campos, a revisão e a chave de criação.');
        const input = parsed.data;
        const callId = action === 'create' ? randomUUID() : params.success ? params.data.id : '';
        const requestHash = hash({ action, callId: action === 'create' ? null : callId, input });
        const saved = await app.db!.begin(async (tx) => {
          await tx`SELECT pg_advisory_xact_lock(hashtext(${key.data}))`;
          const [previous] =
            await tx`SELECT call_id,user_id,request_hash FROM managed_call_commands WHERE id=${key.data}`;
          if (previous) {
            if (previous.user_id !== req.user!.sub || previous.request_hash !== requestHash)
              throw problem(409, 'idempotency_conflict', 'Chave já utilizada em outra operação.');
            return (await tx`SELECT body FROM managed_calls WHERE id=${previous.call_id}`)[0]!.body;
          }
          const [row] = await tx`SELECT body FROM managed_calls WHERE id=${callId} FOR UPDATE`;
          const current = row?.body as ManagedCall | undefined;
          if (action !== 'create') {
            if (!current) throw problem(404, 'call_not_found', 'Call não encontrada.');
            if (!('revision' in input) || input.revision !== current.revision)
              throw problem(
                409,
                'call_revision_conflict',
                'A call foi alterada. Atualize a página.',
              );
            if (
              (
                await tx`SELECT id FROM managed_call_commands WHERE call_id=${callId} AND state='processing' UNION ALL SELECT id FROM managed_call_reminders WHERE call_id=${callId} AND state='processing'`
              ).length
            )
              throw problem(409, 'call_busy', 'Aguarde a confirmação do envio em andamento.');
          }
          let body: ManagedCall;
          const at = new Date().toISOString();
          if ('participantIds' in input) {
            if (Date.parse(input.startsAt) <= Date.now())
              throw problem(400, 'call_in_past', 'Escolha um horário futuro.');
            const people =
              await tx`SELECT body FROM managed_task_people WHERE id IN ${tx(input.participantIds)}`;
            if (
              people.length !== input.participantIds.length ||
              people.some((p) => !p.body.clickupId || !p.body.discordId)
            )
              throw problem(
                400,
                'participant_unmapped',
                'Vincule todos os participantes ao ClickUp e Discord.',
              );
            const { participantIds: _ids, ...fields } = input;
            body = {
              ...fields,
              startsAt: new Date(input.startsAt).toISOString(),
              id: callId,
              participants: people.map((p) => p.body as TaskPerson),
              revision: (current?.revision ?? 0) + 1,
              status: 'scheduled',
              clickupId: current?.clickupId ?? null,
              discordMessageId: current?.discordMessageId ?? null,
              discordChannelId: current?.discordChannelId ?? null,
              syncState: 'queued',
              createdAt: current?.createdAt ?? at,
              updatedAt: at,
            };
          } else
            body = {
              ...current!,
              revision: current!.revision + 1,
              status: action === 'cancel' ? 'cancelled' : 'completed',
              syncState: 'queued',
              updatedAt: at,
            };
          await tx`UPDATE managed_call_commands SET state='superseded',finished_at=now() WHERE call_id=${callId} AND state='queued'`;
          await tx`UPDATE managed_call_reminders SET state='superseded' WHERE call_id=${callId} AND state IN ('queued','failed')`;
          await tx`INSERT INTO managed_calls(id,body) VALUES(${callId},${tx.json(body)}) ON CONFLICT(id) DO UPDATE SET body=excluded.body,updated_at=now()`;
          const command = { id: key.data, action: 'sync', call: body };
          await tx`INSERT INTO managed_call_commands(id,call_id,revision,user_id,request_hash,body) VALUES(${key.data},${callId},${body.revision},${req.user!.sub},${requestHash},${tx.json(command)})`;
          return body;
        });
        return reply.code(202).send(saved);
      },
    });
  }
}

export async function callAutomationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req) => {
    if (!validTaskBridgeSecret(req.headers['x-tmx-task-secret'], env.TASK_AUTOMATION_SECRET))
      throw problem(401, 'unauthorized', 'Credencial de automação inválida.');
    if (!app.db) throw problem(503, 'call_database_unavailable', 'Banco de calls indisponível.');
  });
  app.post('/call-automation/claim', async () =>
    app.db!.begin(async (tx) => {
      // Claim and edits lock the call first: cancellation cannot race an old reminder lease.
      const calls =
        await tx`SELECT c.id FROM managed_calls c WHERE EXISTS (SELECT 1 FROM managed_call_commands q WHERE q.call_id=c.id AND q.state='queued') OR EXISTS (SELECT 1 FROM managed_call_reminders r WHERE r.call_id=c.id AND r.state='queued' AND r.due_at<=now()) ORDER BY c.id LIMIT 15 FOR UPDATE OF c SKIP LOCKED`;
      if (!calls.length) return { commands: [] };
      const ids = calls.map((c) => c.id);
      await tx`UPDATE managed_call_reminders SET state='expired' WHERE call_id IN ${tx(ids)} AND state='queued' AND due_at<now()-interval '2 minutes'`;
      const commands =
        await tx`UPDATE managed_call_commands SET state='processing',claimed_at=now() WHERE id IN (SELECT id FROM managed_call_commands WHERE call_id IN ${tx(ids)} AND state='queued' ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 5) RETURNING body`;
      const reminders =
        await tx`UPDATE managed_call_reminders SET state='processing',claimed_at=now() WHERE id IN (SELECT r.id FROM managed_call_reminders r JOIN managed_calls c ON c.id=r.call_id WHERE r.call_id IN ${tx(ids)} AND r.state='queued' AND r.due_at<=now() AND r.revision=(c.body->>'revision')::int AND c.body->>'status'='scheduled' AND c.body->>'syncState'='synced' ORDER BY r.due_at FOR UPDATE OF r SKIP LOCKED LIMIT 10) RETURNING *`;
      const items = [];
      for (const reminder of reminders) {
        const [row] = await tx`SELECT body FROM managed_calls WHERE id=${reminder.call_id}`;
        items.push({
          id: reminder.id,
          action: 'remind',
          minutes: reminder.minutes,
          call: row!.body,
        });
      }
      return { commands: [...commands.map((r) => r.body), ...items] };
    }),
  );
  app.post('/call-automation/checkpoint', async (req) => {
    const parsed = z
      .object({
        id: uuid,
        revision: z.number().int().min(1),
        clickupId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const input = parsed.data;
    return app.db!.begin(async (tx) => {
      const [identity] = await tx`SELECT call_id FROM managed_call_commands WHERE id=${input.id}`;
      if (!identity) throw problem(404, 'call_command_not_found', 'Comando não encontrado.');
      const [row] =
        await tx`SELECT body FROM managed_calls WHERE id=${identity.call_id} FOR UPDATE`;
      const [command] =
        await tx`SELECT revision,state FROM managed_call_commands WHERE id=${input.id} FOR UPDATE`;
      const call = row!.body as ManagedCall;
      if (call.revision !== input.revision || command!.revision !== input.revision)
        throw problem(409, 'call_revision_conflict', 'Recibo de revisão antiga.');
      if (command!.state !== 'processing')
        throw problem(409, 'call_not_processing', 'Comando não reservado.');
      if (call.clickupId && call.clickupId !== input.clickupId)
        throw problem(409, 'call_identity_conflict', 'Tarefa ClickUp divergente.');
      call.clickupId = input.clickupId;
      await tx`UPDATE managed_calls SET body=${tx.json(call)},updated_at=now() WHERE id=${identity.call_id}`;
      return { accepted: true, clickupId: call.clickupId };
    });
  });
  app.post('/call-automation/result', async (req) => {
    const parsed = z
      .object({
        id: z.string().min(1).max(200),
        revision: z.number().int().min(1),
        ok: z.boolean(),
        clickupId: z
          .string()
          .regex(/^[a-zA-Z0-9_-]+$/)
          .optional(),
        discordMessageId: z.string().regex(/^\d+$/).optional(),
        discordChannelId: z.string().regex(/^\d+$/).optional(),
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const result = parsed.data;
    return app.db!.begin(async (tx) => {
      const [command] = await tx`SELECT * FROM managed_call_commands WHERE id=${result.id}`;
      const [reminder] = command
        ? []
        : await tx`SELECT * FROM managed_call_reminders WHERE id=${result.id}`;
      const identity = command ?? reminder;
      if (!identity) throw problem(404, 'call_command_not_found', 'Comando não encontrado.');
      const [row] =
        await tx`SELECT body FROM managed_calls WHERE id=${identity.call_id} FOR UPDATE`;
      const [entry] = command
        ? await tx`SELECT * FROM managed_call_commands WHERE id=${result.id} FOR UPDATE`
        : await tx`SELECT * FROM managed_call_reminders WHERE id=${result.id} FOR UPDATE`;
      if (!entry) throw problem(404, 'call_command_not_found', 'Comando não encontrado.');
      const call = row!.body as ManagedCall;
      if (call.revision !== result.revision || entry.revision !== result.revision)
        throw problem(409, 'call_revision_conflict', 'Recibo de revisão antiga.');
      if (entry.state === 'succeeded') {
        if (
          result.ok &&
          result.discordMessageId === (command ? call.discordMessageId : entry.discord_message_id)
        )
          return { accepted: true, duplicate: true };
        throw problem(409, 'call_receipt_conflict', 'Recibo não corresponde ao envio confirmado.');
      }
      if (entry.state !== 'processing')
        throw problem(409, 'call_not_processing', 'Comando não reservado.');
      if (
        result.ok &&
        (!result.discordMessageId || !result.discordChannelId || (command && !result.clickupId))
      )
        throw problem(400, 'call_receipt_required', 'Confirme os IDs reais do ClickUp e Discord.');
      if (command) {
        if (result.clickupId && call.clickupId && call.clickupId !== result.clickupId)
          throw problem(409, 'call_identity_conflict', 'Tarefa ClickUp divergente.');
        call.syncState = result.ok ? 'synced' : 'failed';
        if (result.clickupId) call.clickupId = result.clickupId;
        if (result.ok) {
          call.clickupId = result.clickupId!;
          call.discordMessageId = result.discordMessageId!;
          call.discordChannelId = result.discordChannelId!;
        }
        await tx`UPDATE managed_calls SET body=${tx.json(call)},updated_at=now() WHERE id=${call.id}`;
        await tx`UPDATE managed_call_commands SET state=${result.ok ? 'succeeded' : 'failed'},finished_at=now() WHERE id=${result.id}`;
        if (result.ok && call.status === 'scheduled')
          for (const minutes of call.reminderMinutes) {
            const due = new Date(Date.parse(call.startsAt) - minutes * 60000).toISOString();
            const id = `${call.id}:${call.revision}:${minutes}`;
            await tx`INSERT INTO managed_call_reminders(id,call_id,revision,minutes,due_at) VALUES(${id},${call.id},${call.revision},${minutes},${due}) ON CONFLICT DO NOTHING`;
          }
      } else {
        if (result.ok && call.discordChannelId !== result.discordChannelId)
          throw problem(409, 'call_channel_conflict', 'Canal Discord divergente.');
        await tx`UPDATE managed_call_reminders SET state=${result.ok ? 'succeeded' : 'failed'},delivered_at=CASE WHEN ${result.ok} THEN now() ELSE NULL END,discord_message_id=${result.discordMessageId ?? null} WHERE id=${result.id}`;
        if (result.ok)
          for (const person of call.participants)
            if (person.userId) {
              const notification = {
                callId: call.id,
                title: call.title,
                message: call.message,
                startsAt: call.startsAt,
                meetingUrl: call.meetingUrl,
                minutes: reminder!.minutes,
              };
              await tx`INSERT INTO managed_call_notifications(id,user_id,call_id,revision,body) VALUES(${result.id},${person.userId},${call.id},${call.revision},${tx.json(notification)}) ON CONFLICT DO NOTHING`;
            }
      }
      return { accepted: true, duplicate: false };
    });
  });
}
