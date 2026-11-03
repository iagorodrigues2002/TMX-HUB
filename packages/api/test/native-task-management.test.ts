import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env.js';
import { nativeTaskAutomationRoutes } from '../src/routes/native-task-automation.js';
import { notificationCenterRoutes } from '../src/routes/notification-center.js';
import { taskAutomationRoutes, taskManagementRoutes } from '../src/routes/task-management.js';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'synthetic-native-task-tests-only-at-least-32';
  process.env.TASK_MANAGEMENT_MODE = 'native';
  process.env.TASK_AUTOMATION_SECRET = 'synthetic-native-task-bridge-secret-12345';
});
const secret = 'synthetic-native-task-bridge-secret-12345';
const admin = { sub: 'admin', role: 'admin' as const };
const member = { sub: 'member', role: 'user' as const };
const companyId = randomUUID();
const person = {
  id: randomUUID(),
  name: 'QA Member',
  userId: 'member',
  clickupId: null,
  discordId: null,
};
const input = {
  companyId,
  title: 'Tarefa nativa QA',
  description: 'Sem provedor externo',
  sector: 'Spy',
  offer: null,
  assigneeIds: [person.id],
  priority: 'high',
  dueAt: null,
};

describe.skipIf(!process.env.TASK_TEST_DATABASE_URL)(
  'native task lifecycle in isolated Postgres',
  () => {
    const schema = `native_${randomUUID().replaceAll('-', '')}`;
    let root: ReturnType<typeof postgres>;
    let db: ReturnType<typeof postgres>;
    let app: Awaited<ReturnType<typeof appFor>>;
    async function appFor(user = admin as { sub: string; role: 'admin' | 'user' }) {
      const server = Fastify();
      server.decorate('db', db);
      server.decorate('redis', { get: async () => null });
      server.decorate('userStore', {
        getById: async (id: string) =>
          ['admin', 'member', 'other'].includes(id) ? { id, name: id } : null,
        maybeGetById: async (id: string) =>
          ['admin', 'member', 'other'].includes(id)
            ? { id, role: id === 'admin' ? 'admin' : 'user', name: id }
            : null,
      });
      server.decorate('offerStore', { listAccessible: async () => [] });
      server.addHook('preHandler', async (req) => {
        req.user = { ...user, email: 'qa@example.test', iat: 0, exp: 0 };
      });
      await server.register(taskManagementRoutes);
      await server.register(taskAutomationRoutes);
      await server.register(nativeTaskAutomationRoutes);
      await server.register(notificationCenterRoutes);
      return server;
    }
    beforeAll(async () => {
      const url = new URL(process.env.TASK_TEST_DATABASE_URL!);
      if (
        url.hostname !== '127.0.0.1' ||
        url.username !== 'tmx_tasks_test' ||
        url.pathname !== '/tmx_tasks_test'
      )
        throw Error('Refusing non-disposable database');
      root = postgres(url.toString(), { max: 1, onnotice: () => {} });
      await root.unsafe(`CREATE SCHEMA ${schema}`);
      db = postgres(url.toString(), {
        max: 5,
        connection: { search_path: schema },
        onnotice: () => {},
      });
      for (const file of [
        '105_task_management.sql',
        '106_call_management.sql',
        '107_notification_center.sql',
        '108_native_task_management.sql',
        '109_company_memberships.sql',
        '111_sale_notice_preferences.sql',
        '113_company_finance.sql',
        '115_finance_classification.sql',
        '116_finance_card_ledger.sql',
        '117_finance_notifications.sql',
      ]) {
        const path = new URL(`../migrations/${file}`, import.meta.url);
        await db.unsafe(readFileSync(path, 'utf8'));
      }
    });
    beforeEach(async () => {
      env.TASK_AUTOMATION_SECRET = secret;
      env.TASK_DISCORD_CHANNELS_JSON = JSON.stringify({
        Spy: '456',
        Calls: '789',
        [`${companyId}:Spy`]: '456',
        [`${companyId}:Calls`]: '789',
      });
      await db`TRUNCATE managed_native_deliveries,managed_native_requests,managed_task_people,managed_tasks,managed_task_commands,managed_task_events,notification_center_reads,managed_calls CASCADE`;
      await db`INSERT INTO managed_task_people(id,body) VALUES(${person.id},${db.json(person)})`;
      await db`INSERT INTO companies(id,name,created_by) VALUES(${companyId},'QA company','admin') ON CONFLICT DO NOTHING`;
      for (const user of ['admin', 'member', 'other'])
        await db`INSERT INTO company_memberships(company_id,user_id,role) VALUES(${companyId},${user},'member') ON CONFLICT(company_id,user_id) DO UPDATE SET status='active'`;
      app = await appFor();
    });
    afterEach(async () => {
      await app?.close();
    });
    afterAll(async () => {
      await app?.close();
      await db?.end();
      await root?.unsafe(`DROP SCHEMA ${schema} CASCADE`);
      await root?.end();
    });
    const create = (key = randomUUID()) =>
      app.inject({
        method: 'POST',
        url: '/tasks',
        payload: input,
        headers: { 'idempotency-key': key },
      });

    it('leases each delivery only once with competing workers and rejects an invalid bridge secret', async () => {
      await create();
      expect(
        (await app.inject({ method: 'POST', url: '/native-task-automation/claim' })).statusCode,
      ).toBe(401);
      const results = await Promise.all(
        [1, 2, 3].map(() =>
          app.inject({
            method: 'POST',
            url: '/native-task-automation/claim',
            headers: { 'x-tmx-task-secret': secret },
          }),
        ),
      );
      expect(results.every((r) => r.statusCode === 200)).toBe(true);
      expect(results.flatMap((r) => r.json().deliveries)).toHaveLength(1);
    });
    it('creates immediately without ClickUp, Discord identity or automation credentials', async () => {
      env.TASK_AUTOMATION_SECRET = undefined;
      const key = randomUUID();
      const first = await create(key);
      expect(first.statusCode).toBe(201);
      expect(first.json()).toMatchObject({
        managementMode: 'native',
        clickupId: null,
        status: 'pending',
        revision: 1,
        syncState: 'synced',
        discordState: 'pending',
      });
      expect(first.json().assignedAt).toBeTruthy();
      expect(first.json().assignmentReceivedAt[person.id]).toBeTruthy();
      expect((await create(key)).json()).toEqual(first.json());
      expect((await db`SELECT id FROM managed_tasks`).length).toBe(1);
      expect((await db`SELECT id FROM managed_task_commands`).length).toBe(0);
      expect((await db`SELECT id FROM managed_native_deliveries`).length).toBe(1);
      await app.close();
    });
    it('separates native tasks from legacy records without importing or deleting them', async () => {
      const made = await create();
      expect(made.statusCode).toBe(201);
      const legacy = {
        ...made.json(),
        id: randomUUID(),
        managementMode: undefined,
        clickupId: 'legacy-1',
        source: 'clickup',
      };
      await db`INSERT INTO managed_tasks(id,clickup_id,body) VALUES(${legacy.id},${legacy.clickupId},${db.json(legacy)})`;
      const list = (await app.inject('/tasks')).json();
      expect(list.managementMode).toBe('native');
      expect(list.configured).toBe(true);
      expect(list.tasks.map((x: { id: string }) => x.id)).toEqual([made.json().id]);
      expect(list.summary.open).toBe(1);
      expect((await db`SELECT id FROM managed_tasks`).length).toBe(2);
      const event = await app.inject({
        method: 'POST',
        url: '/task-automation/events',
        headers: { 'x-tmx-task-secret': secret },
        payload: {},
      });
      expect(event.statusCode).toBe(410);
      await app.close();
    });
    it('saves status immediately, retains audit history and rejects stale concurrent edits', async () => {
      const made = await create();
      expect(made.statusCode).toBe(201);
      const task = made.json();
      const change = (status: string) =>
        app.inject({
          method: 'PATCH',
          url: `/tasks/${task.id}/status`,
          headers: { 'idempotency-key': randomUUID() },
          payload: { status, revision: 1 },
        });
      const results = await Promise.all([change('progress'), change('done')]);
      expect(results.map((x) => x.statusCode).sort()).toEqual([200, 409]);
      const saved = (await app.inject('/tasks')).json().tasks[0];
      expect(saved.revision).toBe(2);
      expect(['progress', 'done']).toContain(saved.status);
      expect((await app.inject(`/tasks/${task.id}/history`)).json().events).toHaveLength(2);
      expect((await db`SELECT id FROM managed_task_commands`).length).toBe(0);
      await app.close();
    });
    it('lets the assignee complete through the central, removing the notice only on completion', async () => {
      const made = await create();
      expect(made.statusCode).toBe(201);
      const task = made.json();
      const own = await appFor(member);
      const other = await appFor({ sub: 'other', role: 'user' });
      const notifications = (await own.inject('/notifications')).json().notifications;
      expect(notifications).toHaveLength(1);
      await own.inject({
        method: 'POST',
        url: '/notifications/read',
        payload: { ids: [notifications[0].id] },
      });
      expect((await own.inject('/notifications')).json().notifications).toHaveLength(1);
      const status = (server: typeof own) =>
        server.inject({
          method: 'POST',
          url: `/notifications/tasks/${task.id}/status`,
          headers: { 'idempotency-key': randomUUID() },
          payload: { status: 'done', revision: 1 },
        });
      expect((await status(other)).statusCode).toBe(404);
      expect((await status(own)).statusCode).toBe(200);
      expect((await own.inject('/notifications')).json().notifications).toEqual([]);
      expect((await other.inject('/tasks')).statusCode).toBe(403);
      await Promise.all([app.close(), own.close(), other.close()]);
    });
    it('edits title, deadline and assignees without creating a second task', async () => {
      const made = await create();
      expect(made.statusCode).toBe(201);
      const task = made.json();
      const p2 = { ...person, id: randomUUID(), name: 'QA Other', userId: 'other' };
      await db`INSERT INTO managed_task_people(id,body) VALUES(${p2.id},${db.json(p2)})`;
      const result = await app.inject({
        method: 'PUT',
        url: `/tasks/${task.id}`,
        headers: { 'idempotency-key': randomUUID() },
        payload: {
          title: 'Tarefa revisada',
          description: 'Novo texto',
          priority: 'urgent',
          dueAt: '2026-12-01T17:00:00Z',
          assigneeIds: [p2.id],
          revision: 1,
        },
      });
      expect(result.statusCode).toBe(200);
      expect(result.json()).toMatchObject({
        title: 'Tarefa revisada',
        priority: 'urgent',
        revision: 2,
      });
      expect(result.json().assignees.map((p: { id: string }) => p.id)).toEqual([p2.id]);
      expect((await db`SELECT id FROM managed_tasks`).length).toBe(1);
      expect((await db`SELECT id FROM managed_native_deliveries`).length).toBe(1);
      await app.close();
    });
    const claim = () =>
      app.inject({
        method: 'POST',
        url: '/native-task-automation/claim',
        headers: { 'x-tmx-task-secret': secret },
      });
    const receipt = (lease: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
      app.inject({
        method: 'POST',
        url: '/native-task-automation/result',
        headers: { 'x-tmx-task-secret': secret },
        payload: {
          id: lease.id,
          leaseId: lease.leaseId,
          revision: lease.revision,
          outcome: 'confirmed',
          messageId: '777',
          channelId: '456',
          ...extra,
        },
      });
    it('isolates the native publisher and accepts only a matching confirmed Discord receipt', async () => {
      expect(
        (await app.inject({ method: 'POST', url: '/native-task-automation/claim' })).statusCode,
      ).toBe(401);
      const made = await create();
      expect(made.statusCode).toBe(201);
      const first = (await claim()).json().deliveries[0];
      expect(first.entityKind).toBe('task');
      expect(first.channelId).toBe('456');
      expect((await claim()).json().deliveries).toEqual([]);
      expect((await receipt(first, { channelId: '999' })).statusCode).toBe(409);
      expect((await receipt(first)).statusCode).toBe(200);
      expect((await receipt(first)).json().duplicate).toBe(true);
      expect((await receipt(first, { messageId: '888' })).statusCode).toBe(409);
      const saved = (await app.inject('/tasks')).json().tasks[0];
      expect(saved.discordState).toBe('synced');
      expect(saved.discordMessageId).toBe('777');
      expect((await db`SELECT id FROM managed_task_commands`).length).toBe(0);
      await app.close();
    });
    it('coalesces edits during delivery and updates the same card on the next revision', async () => {
      const made = await create();
      const task = made.json();
      const first = (await claim()).json().deliveries[0];
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/tasks/${task.id}/status`,
            headers: { 'idempotency-key': randomUUID() },
            payload: { status: 'progress', revision: 1 },
          })
        ).statusCode,
      ).toBe(200);
      expect((await receipt(first)).statusCode).toBe(200);
      const saved = (await app.inject('/tasks')).json().tasks[0];
      expect(saved.status).toBe('progress');
      expect(saved.discordState).toBe('pending');
      const second = (await claim()).json().deliveries[0];
      expect(second.messageId).toBe('777');
      expect(second.revision).toBe(2);
      expect((await receipt(second)).statusCode).toBe(200);
      expect((await claim()).json().deliveries).toEqual([]);
      await app.close();
    });
    it('quarantines expired leases instead of blindly posting another card', async () => {
      await create();
      const first = (await claim()).json().deliveries[0];
      await db`UPDATE managed_native_deliveries SET lease_expires_at=now()-interval '1 second' WHERE id=${first.id}`;
      expect((await claim()).json().deliveries).toEqual([]);
      const [row] = await db`SELECT state FROM managed_native_deliveries WHERE id=${first.id}`;
      expect(row.state).toBe('uncertain');
      const saved = (await app.inject('/tasks')).json().tasks[0];
      expect(saved.status).toBe('pending');
      expect(saved.syncState).toBe('synced');
      await app.close();
    });
    it('limits definite retries without blocking canonical task changes', async () => {
      await create();
      for (let attempt = 1; attempt <= 3; attempt++) {
        const leased = (await claim()).json().deliveries[0];
        expect(leased).toBeTruthy();
        expect((await receipt(leased, { outcome: 'retryable', retryAfterMs: 0 })).statusCode).toBe(
          200,
        );
      }
      expect((await claim()).json().deliveries).toEqual([]);
      const [row] =
        await db`SELECT state,attempts,discord_message_id FROM managed_native_deliveries`;
      expect(row.state).toBe('failed');
      expect(row.attempts).toBe(3);
      expect(row.discord_message_id).toBeNull();
      const task = (await app.inject('/tasks')).json().tasks[0];
      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: `/tasks/${task.id}/status`,
            headers: { 'idempotency-key': randomUUID() },
            payload: { status: 'progress', revision: 1 },
          })
        ).statusCode,
      ).toBe(200);
      await app.close();
    });
    it('authorizes Discord button actors against their TMX assignment and deduplicates interactions', async () => {
      const made = await create();
      const task = made.json();
      const leased = (await claim()).json().deliveries[0];
      await receipt(leased);
      await db`UPDATE managed_task_people SET body=jsonb_set(body,'{discordId}','"123"') WHERE id=${person.id}`;
      const payload = {
        interactionId: '112233',
        taskId: task.id,
        actorDiscordId: '123',
        messageId: '777',
        channelId: '456',
        revision: 1,
        status: 'done',
      };
      const action = (fields = {}) =>
        app.inject({
          method: 'POST',
          url: '/native-task-automation/interaction',
          headers: { 'x-tmx-task-secret': secret },
          payload: { ...payload, ...fields },
        });
      expect((await action({ actorDiscordId: '999' })).statusCode).toBe(403);
      expect((await action({ channelId: '999' })).statusCode).toBe(404);
      const first = await action();
      expect(first.statusCode).toBe(200);
      expect(first.json().status).toBe('done');
      expect((await action()).json()).toEqual(first.json());
      expect((await action({ status: 'pending' })).statusCode).toBe(409);
      expect((await db`SELECT event_id FROM managed_task_events`).length).toBe(2);
      await app.close();
    });
    it('accepts a new Discord task only from a mapped TMX administrator, with replay protection', async () => {
      const creator = {
        ...person,
        id: randomUUID(),
        name: 'QA Admin',
        userId: 'admin',
        discordId: '999',
      };
      await db`INSERT INTO managed_task_people(id,body) VALUES(${creator.id},${db.json(creator)})`;
      await db`UPDATE managed_task_people SET body=jsonb_set(body,'{discordId}','"123"') WHERE id=${person.id}`;
      const make = (actorDiscordId: string) =>
        app.inject({
          method: 'POST',
          url: '/native-task-automation/create',
          headers: { 'x-tmx-task-secret': secret },
          payload: { messageId: '556677', actorDiscordId, task: input },
        });
      expect((await make('123')).statusCode).toBe(403);
      const first = await make('999');
      expect(first.statusCode).toBe(201);
      expect(first.json().source).toBe('discord');
      expect(first.json().clickupId).toBeNull();
      expect((await make('999')).json()).toEqual(first.json());
      expect((await db`SELECT id FROM managed_tasks`).length).toBe(1);
      await app.close();
    });
  },
);
