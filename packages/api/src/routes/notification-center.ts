import { createHash } from 'node:crypto';
import {
  type CenterNotification,
  type ManagedTask,
  type TaskCommand,
  TaskStatusSchema,
} from '@page-cloner/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../env.js';
import { participantHasCompanyAccess } from '../lib/company-operation-access.js';
import { HttpProblem, zodToProblem } from '../lib/problem.js';
import { changeNativeTaskStatus } from '../services/native-tasks.js';
import { saleNoticeOffers } from '../services/sale-notice-preferences.js';
const problem = (status: number, code: string, detail: string) =>
  new HttpProblem({ status, code, title: code, detail });
const taskEventId = (t: ManagedTask) => `task:${t.id}:${t.updatedAt}`;
export async function notificationCenterRoutes(app: FastifyInstance) {
  app.addHook('preHandler', async (req, reply) => {
    reply.header('Cache-Control', 'private, no-store');
    if (!req.user) throw problem(401, 'unauthorized', 'Entre na sua conta.');
    if (!app.db)
      throw problem(503, 'notifications_unavailable', 'Central temporariamente indisponível.');
  });
  const offersFor = async (
    user: NonNullable<Parameters<typeof saleNoticeOffers>[1]> & { tools?: string[] },
  ) =>
    user.role !== 'admin' && user.tools !== undefined && !user.tools.includes('ofertas')
      ? []
      : saleNoticeOffers(app, user);
  app.get('/notifications', async (req) => {
    const user = req.user!;
    const db = app.db!;
    const global = user.role === 'admin';
    const memberships = global
      ? []
      : await db`SELECT company_id::text AS id,status FROM company_memberships WHERE user_id=${user.sub}`;
    const activeCompanies = memberships.filter((m) => m.status === 'active').map((m) => m.id);
    // Revoked memberships must not reopen access to unscoped legacy records.
    const legacyAllowed = global || memberships.length === 0;
    const callModes = env.TASK_MANAGEMENT_MODE === 'native' ? ['native', 'clickup'] : ['clickup'];
    const offers = await offersFor(user);
    const offerIds = offers.map((o) => o.id);
    const names = new Map(offers.map((o) => [o.id, o.name]));
    const [tasks, calls, sales] = await Promise.all([
      db`SELECT t.body,r.event_id AS read_id FROM managed_tasks t LEFT JOIN notification_center_reads r ON r.user_id=${user.sub} AND r.event_id='task:'||t.id||':'||(t.body->>'updatedAt') WHERE coalesce(t.body->>'managementMode','clickup')=${env.TASK_MANAGEMENT_MODE} AND t.body->>'status'<>'done' AND (${global} OR (t.body->>'companyId'=ANY(${activeCompanies}::text[])) OR (t.body->>'companyId' IS NULL AND ${legacyAllowed})) AND EXISTS(SELECT 1 FROM managed_task_people p WHERE p.body->>'userId'=${user.sub} AND t.body->'assignees' @> jsonb_build_array(jsonb_build_object('id',p.id))) ORDER BY t.updated_at DESC LIMIT 100`,
      db`SELECT c.id,c.body,r.event_id AS read_id FROM managed_calls c LEFT JOIN notification_center_reads r ON r.user_id=${user.sub} AND r.event_id='call:scheduled:'||c.id||':'||(c.body->>'revision') WHERE coalesce(c.body->>'managementMode','clickup')=ANY(${callModes}::text[]) AND c.body->>'status'='scheduled' AND (${global} OR (c.body->>'companyId'=ANY(${activeCompanies}::text[])) OR (c.body->>'companyId' IS NULL AND ${legacyAllowed})) AND EXISTS(SELECT 1 FROM managed_task_people p WHERE p.body->>'userId'=${user.sub} AND c.body->'participants' @> jsonb_build_array(jsonb_build_object('id',p.id))) ORDER BY (c.body->>'startsAt')::timestamptz ASC`,
      offerIds.length
        ? db`SELECT o.id,o.provider,o.amount_minor,o.currency,o.order_kind,e.created_at AS occurred_at,p.offer_id,c.operator_id FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id JOIN browser_sale_events e ON e.order_id=o.id LEFT JOIN tracking_upsell_operator_credits c ON c.order_id=o.id AND c.project_id=o.project_id WHERE p.offer_id=ANY(${offerIds}) AND o.status='paid' AND e.created_at<=now() AND NOT EXISTS(SELECT 1 FROM notification_center_reads r WHERE r.user_id=${user.sub} AND r.event_id='sale:'||o.id) ORDER BY e.created_at DESC,o.id DESC LIMIT 200`
        : [],
    ]);
    const operatorIds = [...new Set(sales.map((s) => s.operator_id).filter(Boolean))];
    const operators = new Map(
      await Promise.all(
        operatorIds.map(
          async (id) => [id, (await app.userStore.maybeGetById(id))?.name ?? null] as const,
        ),
      ),
    );
    const notifications: CenterNotification[] = [
      ...tasks.map((r) => {
        const task = r.body as ManagedTask;
        const id = taskEventId(task);
        return {
          id,
          kind: 'task' as const,
          title: task.title,
          createdAt: task.updatedAt,
          unread: !r.read_id,
          task,
        };
      }),
      ...sales.map((s) => ({
        id: `sale:${s.id}`,
        kind: 'sale' as const,
        unread: true as const,
        title: 'Venda aprovada',
        createdAt: new Date(s.occurred_at).toISOString(),
        sale: {
          id: s.id,
          offerId: s.offer_id,
          offerName: names.get(s.offer_id) ?? '',
          provider: s.provider,
          amountMinor: s.amount_minor === null ? null : String(s.amount_minor),
          currency: s.currency,
          orderKind: s.order_kind,
          lastClick: s.operator_id
            ? { operatorId: s.operator_id, operatorName: operators.get(s.operator_id) ?? null }
            : null,
        },
      })),
      ...calls.map((n) => ({
        id: `call:scheduled:${n.id}:${n.body.revision}`,
        kind: 'call' as const,
        unread: !n.read_id,
        title: n.body.title,
        createdAt: n.body.updatedAt,
        call: {
          callId: n.id,
          message: n.body.message,
          startsAt: n.body.startsAt,
          meetingUrl: n.body.meetingUrl,
          minutes: null,
        },
      })),
    ];
    return {
      notifications: notifications.sort((a, b) => {
        if (a.kind === 'call' && b.kind === 'call')
          return Date.parse(a.call.startsAt) - Date.parse(b.call.startsAt);
        if (a.kind === 'call') return -1;
        if (b.kind === 'call') return 1;
        return Date.parse(b.createdAt) - Date.parse(a.createdAt);
      }),
    };
  });
  app.post('/notifications/read', async (req) => {
    const parsed = z
      .object({
        ids: z
          .array(
            z
              .string()
              .min(1)
              .max(300)
              .regex(/^(task|sale|call):/),
          )
          .max(500),
      })
      .strict()
      .safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    const ids = [...new Set(parsed.data.ids)];
    if (!ids.length) return { read: true };
    await app.db!.begin(async (tx) => {
      await tx`INSERT INTO notification_center_reads(user_id,event_id) SELECT ${req.user!.sub},event_id FROM unnest(${ids}::text[]) event_id ON CONFLICT DO NOTHING`;
      for (const id of ids.filter((id) => id.startsWith('call:')))
        await tx`UPDATE managed_call_notifications SET read_at=now() WHERE user_id=${req.user!.sub} AND id=${id.slice(5)}`;
    });
    return { read: true };
  });
  app.post('/notifications/clear-sales', async (req) => {
    const parsed = z.object({ all: z.boolean() }).strict().safeParse(req.body);
    if (!parsed.success) throw zodToProblem(parsed.error, req.url);
    if (!parsed.data.all) return { cleared: true };
    const ids = (await offersFor(req.user!)).map((o) => o.id);
    if (!ids.length) return { cleared: true };
    await app.db!`INSERT INTO notification_center_reads(user_id,event_id) SELECT ${req.user!.sub},'sale:'||o.id FROM tracking_orders o JOIN tracking_projects p ON p.id=o.project_id JOIN browser_sale_events e ON e.order_id=o.id WHERE p.offer_id=ANY(${ids}) AND o.status='paid' AND e.created_at<=now() ON CONFLICT DO NOTHING`;
    return { cleared: true };
  });
  app.post('/notifications/tasks/:id/status', async (req, reply) => {
    if (env.TASK_MANAGEMENT_MODE !== 'native' && !env.TASK_AUTOMATION_SECRET)
      throw problem(503, 'task_automation_unconfigured', 'Automação não configurada.');
    const params = z.object({ id: z.string().uuid() }).safeParse(req.params);
    const body = z
      .object({ status: TaskStatusSchema, revision: z.number().int().min(1).optional() })
      .strict()
      .safeParse(req.body);
    const key = z.string().uuid().safeParse(req.headers['idempotency-key']);
    if (!params.success || !body.success || !key.success)
      throw problem(400, 'invalid_task_status', 'Confira a tarefa e o status.');
    const assertAssigned = async (db: NonNullable<typeof app.db>) => {
      const [row] =
        await db`SELECT t.body FROM managed_tasks t WHERE t.id=${params.data.id} AND coalesce(t.body->>'managementMode','clickup')=${env.TASK_MANAGEMENT_MODE} AND EXISTS(SELECT 1 FROM managed_task_people p WHERE p.body->>'userId'=${req.user!.sub} AND t.body->'assignees' @> jsonb_build_array(jsonb_build_object('id',p.id)))`;
      if (
        !row ||
        (req.user!.role !== 'admin' &&
          !(await participantHasCompanyAccess(db, req.user!.sub, row.body.companyId)))
      )
        throw problem(404, 'task_not_found', 'Tarefa não encontrada para sua conta.');
    };
    await assertAssigned(app.db!);
    if (env.TASK_MANAGEMENT_MODE === 'native') {
      if (!body.data.revision)
        throw problem(400, 'revision_required', 'Atualize a tarefa antes de alterar o status.');
      return reply.send(
        await changeNativeTaskStatus(
          app.db!,
          key.data,
          { id: req.user!.sub, admin: req.user!.role === 'admin', requireAssignment: true },
          params.data.id,
          body.data.status,
          body.data.revision,
        ),
      );
    }
    await app.db!.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(hashtext(${key.data}))`;
      const [row] =
        await tx`SELECT t.body FROM managed_tasks t WHERE t.id=${params.data.id} AND EXISTS(SELECT 1 FROM managed_task_people p WHERE p.body->>'userId'=${req.user!.sub} AND t.body->'assignees' @> jsonb_build_array(jsonb_build_object('id',p.id))) FOR UPDATE OF t`;
      if (!row) throw problem(404, 'task_not_found', 'Tarefa não encontrada para sua conta.');
      const task = row.body as ManagedTask;
      if (
        req.user!.role !== 'admin' &&
        !(await participantHasCompanyAccess(tx, req.user!.sub, task.companyId))
      )
        throw problem(404, 'task_not_found', 'Tarefa não encontrada para sua conta.');
      const requestHash = createHash('sha256')
        .update(JSON.stringify({ status: body.data.status, taskId: task.id }))
        .digest('hex');
      const [existing] =
        await tx`SELECT user_id,request_hash FROM managed_task_commands WHERE id=${key.data}`;
      if (existing) {
        if (existing.user_id !== req.user!.sub || existing.request_hash !== requestHash)
          throw problem(409, 'idempotency_conflict', 'Chave já utilizada.');
        return;
      }
      if (!task.clickupId || !task.discordMessageId || !task.discordChannelId)
        throw problem(409, 'task_not_synced', 'Aguarde a confirmação da integração.');
      if (
        (
          await tx`SELECT id FROM managed_task_commands WHERE task_id=${task.id} AND state IN ('queued','processing')`
        ).length
      )
        throw problem(409, 'task_busy', 'Existe uma alteração em andamento.');
      const command: TaskCommand = {
        id: key.data,
        taskId: task.id,
        action: 'status',
        status: body.data.status,
        task,
      };
      await tx`INSERT INTO managed_task_commands(id,user_id,request_hash,task_id,body) VALUES(${key.data},${req.user!.sub},${requestHash},${task.id},${tx.json(command)})`;
      await tx`UPDATE managed_tasks SET body=jsonb_set(body,'{syncState}','"queued"'),updated_at=now() WHERE id=${task.id}`;
    });
    return reply.code(202).send({ queued: true });
  });
}
