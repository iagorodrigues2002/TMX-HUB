import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env.js';
import { HttpProblem } from '../src/lib/problem.js';
import { callManagementRoutes } from '../src/routes/call-management.js';
import { nativeTaskAutomationRoutes } from '../src/routes/native-task-automation.js';
import { taskManagementRoutes } from '../src/routes/task-management.js';
import { processNativeCallNotices } from '../src/services/native-calls.js';
import { changeNativeTaskStatus } from '../src/services/native-tasks.js';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'synthetic-company-task-tests-secret-32-characters';
  process.env.TASK_MANAGEMENT_MODE = 'native';
  process.env.TASK_AUTOMATION_SECRET = 'synthetic-company-tasks-bridge-only';
});

describe.skipIf(!process.env.TASK_TEST_DATABASE_URL)('company-scoped tasks and calls', () => {
  const schema = `company_tasks_${randomUUID().replaceAll('-', '')}`;
  const tmx = randomUUID();
  const other = randomUUID();
  const douglasPerson = randomUUID();
  const yolaPerson = randomUUID();
  let root: ReturnType<typeof postgres>;
  let db: ReturnType<typeof postgres>;
  const apps: Awaited<ReturnType<typeof makeApp>>[] = [];
  async function makeApp(
    sub = 'global',
    role: 'admin' | 'user' = sub === 'global' ? 'admin' : 'user',
  ) {
    const app = Fastify();
    app.decorate('db', db);
    app.decorate('userStore', {
      maybeGetById: async (id: string) => ({
        id,
        name: id,
        email: `${id}@example.test`,
        role: id === 'global' ? 'admin' : 'user',
      }),
      getById: async (id: string) => ({ id, role: id === 'global' ? 'admin' : 'user' }),
    });
    app.setErrorHandler((error, _req, reply) =>
      reply.code(error instanceof HttpProblem ? error.status : 500).send({
        code: error instanceof HttpProblem ? error.code : 'unexpected',
        message: error.message,
      }),
    );
    app.addHook('preHandler', async (req) => {
      req.user = { sub, role, email: `${sub}@example.test`, iat: 0, exp: 0 };
    });
    await app.register(taskManagementRoutes);
    await app.register(callManagementRoutes);
    await app.register(nativeTaskAutomationRoutes);
    apps.push(app);
    return app;
  }
  beforeAll(async () => {
    const url = new URL(process.env.TASK_TEST_DATABASE_URL!);
    if (
      url.hostname !== '127.0.0.1' ||
      url.username !== 'tmx_tasks_test' ||
      url.pathname !== '/tmx_tasks_test'
    )
      throw Error('Disposable database required');
    root = postgres(url.toString(), { max: 1, onnotice: () => {} });
    await root.unsafe(`CREATE SCHEMA ${schema}`);
    db = postgres(url.toString(), {
      max: 5,
      connection: { search_path: schema },
      onnotice: () => {},
    });
    for (const name of [
      '105_task_management.sql',
      '106_call_management.sql',
      '108_native_task_management.sql',
      '109_company_memberships.sql',
    ])
      await db.unsafe(readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8'));
  });
  beforeEach(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    env.TASK_MANAGEMENT_MODE = 'native';
    env.TASK_DISCORD_CHANNELS_JSON = JSON.stringify({
      Calls: '999',
      Spy: '998',
      [`${tmx}:Calls`]: '111',
      [`${tmx}:Spy`]: '112',
      [`${other}:Calls`]: '221',
      [`${other}:Spy`]: '222',
    });
    await db`TRUNCATE managed_native_requests,managed_native_deliveries,managed_call_notifications,managed_calls,managed_task_events,managed_tasks,managed_task_people,companies CASCADE`;
    await db`INSERT INTO companies(id,name,created_by) VALUES(${tmx},'TMX','global'),(${other},'Other','yola')`;
    await db`INSERT INTO company_memberships(company_id,user_id,role) VALUES(${tmx},'douglas','admin'),(${tmx},'member','member'),(${other},'yola','owner')`;
    for (const [id, userId, discordId] of [
      [douglasPerson, 'douglas', '123'],
      [yolaPerson, 'yola', '456'],
    ])
      await db`INSERT INTO managed_task_people(id,body) VALUES(${id!},${db.json({ id: id!, name: userId!, userId: userId!, discordId: discordId!, clickupId: null })})`;
  });
  afterAll(async () => {
    await Promise.all(apps.splice(0).map((app) => app.close()));
    await db?.end();
    await root?.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await root?.end();
  });
  const taskInput = (companyId: string | null = tmx, assigneeIds = [douglasPerson]) => ({
    companyId,
    title: 'Company task',
    description: '',
    sector: 'Spy',
    offer: null,
    priority: 'normal',
    dueAt: null,
    assigneeIds,
  });
  const callInput = (companyId: string | null = tmx, participantIds = [douglasPerson]) => ({
    companyId,
    title: 'Company call',
    description: '',
    message: 'Private reminder',
    startsAt: new Date(Date.now() + 4.5 * 60000).toISOString(),
    meetingUrl: 'https://meet.google.com/abc-defg-hij',
    durationMinutes: 60,
    participantIds,
    reminderMinutes: [5],
  });
  const post = (
    app: Awaited<ReturnType<typeof makeApp>>,
    url: string,
    payload: unknown,
    key = randomUUID(),
  ) =>
    app.inject({
      method: 'POST',
      url,
      payload: payload as object,
      headers: { 'idempotency-key': key },
    });

  it('allows company admin only own creation/list/summary/history and scoped people', async () => {
    const global = await makeApp();
    const douglas = await makeApp('douglas');
    const yola = await makeApp('yola');
    const created = await post(douglas, '/tasks', taskInput());
    expect(created.statusCode, created.body).toBe(201);
    const task = created.json();
    expect((await post(global, '/tasks', taskInput(other, [yolaPerson]))).statusCode).toBe(201);
    expect((await post(global, '/tasks', taskInput(null))).statusCode).toBe(400);
    const legacy = { ...task, id: randomUUID(), companyId: null };
    await db`INSERT INTO managed_tasks(id,body) VALUES(${legacy.id},${db.json(legacy)})`;
    const own = (await douglas.inject('/tasks')).json();
    expect(own.total).toBe(1);
    expect(own.summary.open).toBe(1);
    expect(own.tasks[0].companyId).toBe(tmx);
    expect((await global.inject('/tasks')).json().total).toBe(3);
    expect((await yola.inject(`/tasks/${task.id}/history`)).statusCode).toBe(403);
    expect((await yola.inject(`/tasks?companyId=${tmx}`)).statusCode).toBe(403);
    expect(
      (await douglas.inject('/tasks/people')).json().people.map((p: { id: string }) => p.id),
    ).toEqual([douglasPerson]);
    expect(
      (await douglas.inject(`/tasks/users?companyId=${tmx}`))
        .json()
        .users.map((p: { id: string }) => p.id)
        .sort(),
    ).toEqual(['douglas', 'member']);
    expect((await douglas.inject(`/tasks/users?companyId=${other}`)).statusCode).toBe(403);
    expect((await post(yola, '/tasks', taskInput())).statusCode).toBe(403);
    expect((await post(douglas, '/tasks', taskInput(tmx, [yolaPerson]))).statusCode).toBe(403);
    expect((await post(douglas, '/tasks', taskInput(null))).statusCode).toBe(400);
    expect(
      (await douglas.inject('/tasks/access')).json().companies.map((c: { id: string }) => c.id),
    ).toEqual([tmx]);
  });

  it('denies cross-company update, participant management, and replay after suspension', async () => {
    const douglas = await makeApp('douglas');
    const yola = await makeApp('yola');
    const member = await makeApp('member');
    const key = randomUUID();
    const input = taskInput();
    const task = (await post(douglas, '/tasks', input, key)).json();
    expect(
      (
        await yola.inject({
          method: 'PATCH',
          url: `/tasks/${task.id}/status`,
          payload: { revision: 1, status: 'done' },
          headers: { 'idempotency-key': randomUUID() },
        })
      ).statusCode,
    ).toBe(403);
    expect((await member.inject('/tasks')).statusCode).toBe(403);
    expect(
      (
        await douglas.inject({
          method: 'PATCH',
          url: `/tasks/${task.id}/status`,
          payload: { revision: 1, status: 'progress' },
          headers: { 'idempotency-key': randomUUID() },
        })
      ).statusCode,
    ).toBe(200);
    await db`UPDATE company_memberships SET status='suspended' WHERE user_id='douglas'`;
    expect((await post(douglas, '/tasks', input, key)).statusCode).toBe(403);
    await expect(
      changeNativeTaskStatus(
        db,
        randomUUID(),
        { id: 'douglas', admin: false, requireAssignment: true },
        task.id,
        'done',
        2,
      ),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('calls retain company, reject foreign participants and preserve legacy only for globals', async () => {
    const global = await makeApp();
    const douglas = await makeApp('douglas');
    const yola = await makeApp('yola');
    const input = callInput();
    const made = await post(douglas, '/calls', input);
    expect(made.statusCode, made.body).toBe(201);
    const call = made.json();
    expect((await post(yola, '/calls', callInput(other, [yolaPerson]))).statusCode).toBe(201);
    const old = {
      ...call,
      id: randomUUID(),
      companyId: undefined,
      managementMode: undefined,
      clickupId: 'legacy',
      discordMessageId: '1234',
      discordChannelId: '999',
    };
    await db`INSERT INTO managed_calls(id,body) VALUES(${old.id},${db.json(old)})`;
    expect((await douglas.inject('/calls')).json().calls.map((c: { id: string }) => c.id)).toEqual([
      call.id,
    ]);
    expect((await global.inject('/calls')).json().total).toBe(3);
    expect((await post(yola, `/calls/${call.id}/cancel`, { revision: 1 })).statusCode).toBe(403);
    expect((await post(douglas, '/calls', callInput(tmx, [yolaPerson]))).statusCode).toBe(403);
    expect(
      (
        await douglas.inject({
          method: 'PUT',
          url: `/calls/${call.id}`,
          headers: { 'idempotency-key': randomUUID() },
          payload: { ...input, companyId: other, revision: 1 },
        })
      ).statusCode,
    ).toBe(409);
    expect((await post(douglas, `/calls/${old.id}/cancel`, { revision: 1 })).statusCode).toBe(403);
  });

  it('rechecks call recipients at reminder time and before returning notifications', async () => {
    const douglas = await makeApp('douglas');
    const yola = await makeApp('yola');
    const call = (await post(douglas, '/calls', callInput())).json();
    await processNativeCallNotices(db);
    expect((await douglas.inject('/calls/notifications')).json().notifications).toHaveLength(1);
    expect((await yola.inject('/calls/notifications')).json().notifications).toHaveLength(0);
    await db`UPDATE company_memberships SET status='suspended' WHERE user_id='douglas'`;
    expect((await douglas.inject('/calls/notifications')).json().notifications).toHaveLength(0);
    await db`DELETE FROM managed_call_notifications WHERE call_id=${call.id}`;
    await processNativeCallNotices(db);
    expect((await db`SELECT count(*)::int n FROM managed_call_notifications`)[0]!.n).toBe(0);
  });

  it('uses company-specific Discord channels and blocks revoked recipients at claim', async () => {
    const douglas = await makeApp('douglas');
    const global = await makeApp();
    const made = await post(douglas, '/tasks', taskInput());
    expect(made.statusCode).toBe(201);
    expect(
      (
        await db`SELECT target_channel_id FROM managed_native_deliveries WHERE entity_kind='task'`
      )[0]!.target_channel_id,
    ).toBe('112');
    await db`UPDATE company_memberships SET status='suspended' WHERE user_id='douglas'`;
    const claim = await global.inject({
      method: 'POST',
      url: '/native-task-automation/claim',
      headers: { 'x-tmx-task-secret': env.TASK_AUTOMATION_SECRET },
    });
    expect(claim.statusCode, claim.body).toBe(200);
    expect(claim.json().deliveries).toEqual([]);
    expect(
      (await db`SELECT error_code FROM managed_native_deliveries WHERE entity_kind='task'`)[0]!
        .error_code,
    ).toBe('company_recipient_revoked');
  });

  it('never falls back to global Discord channel for another company', async () => {
    env.TASK_DISCORD_CHANNELS_JSON = JSON.stringify({ Calls: '999', Spy: '998' });
    const yola = await makeApp('yola');
    expect((await post(yola, '/calls', callInput(other, [yolaPerson]))).statusCode).toBe(201);
    expect(
      (await db`SELECT target_channel_id FROM managed_native_deliveries`).every(
        (r) => r.target_channel_id === null,
      ),
    ).toBe(true);
  });

  it('requires explicit company on new HTTP records and rejects the unscoped legacy publisher', async () => {
    const global = await makeApp();
    expect((await post(global, '/calls', callInput(null))).statusCode).toBe(400);
    env.TASK_MANAGEMENT_MODE = 'clickup';
    expect((await post(global, '/tasks', taskInput())).statusCode).toBe(409);
    expect((await post(global, '/calls', callInput())).statusCode).toBe(409);
    expect((await db`SELECT count(*)::int n FROM managed_tasks`)[0]!.n).toBe(0);
    expect((await db`SELECT count(*)::int n FROM managed_calls`)[0]!.n).toBe(0);
  });

  it('authorizes Discord company admin creation and forbids another company', async () => {
    const app = await makeApp();
    const send = (actorDiscordId: string, companyId: string, assigneeIds: string[]) =>
      app.inject({
        method: 'POST',
        url: '/native-task-automation/create',
        headers: { 'x-tmx-task-secret': env.TASK_AUTOMATION_SECRET },
        payload: {
          actorDiscordId,
          messageId: '123456789',
          task: taskInput(companyId, assigneeIds),
        },
      });
    expect((await send('123', other, [yolaPerson])).statusCode).toBe(403);
    const created = await send('123', tmx, [douglasPerson]);
    expect(created.statusCode, created.body).toBe(201);
    expect((await send('123', tmx, [douglasPerson])).json().id).toBe(created.json().id);
    await db`UPDATE company_memberships SET status='suspended' WHERE user_id='douglas'`;
    expect((await send('123', tmx, [douglasPerson])).statusCode).toBe(403);
  });

  it('revalidates current assignment before replay from the notification central', async () => {
    const app = await makeApp('douglas');
    const task = (await post(app, '/tasks', taskInput())).json();
    const key = randomUUID();
    const actor = { id: 'douglas', admin: false, requireAssignment: true };
    await changeNativeTaskStatus(db, key, actor, task.id, 'progress', 1);
    await db`UPDATE managed_tasks SET body=jsonb_set(body,'{assignees}','[]'::jsonb) WHERE id=${task.id}`;
    await expect(
      changeNativeTaskStatus(db, key, actor, task.id, 'progress', 1),
    ).rejects.toMatchObject({ status: 403 });
  });

  it('company admin cannot claim Discord identities of global admins or multi-company owners', async () => {
    const douglas = await makeApp('douglas');
    await db`INSERT INTO company_memberships(company_id,user_id,role) VALUES(${tmx},'global','owner'),(${tmx},'multi-owner','member'),(${other},'multi-owner','owner')`;
    for (const userId of ['global', 'multi-owner', 'member']) {
      const response = await post(douglas, '/tasks/people', {
        id: randomUUID(),
        name: 'Fake Discord identity',
        userId,
        clickupId: null,
        discordId: '999999',
      });
      expect(response.statusCode, response.body).toBe(403);
    }
    expect(
      (
        await post(douglas, '/tasks/people', {
          id: randomUUID(),
          name: 'No privileged binding',
          userId: 'global',
          clickupId: null,
          discordId: null,
        })
      ).statusCode,
    ).toBe(403);
    const safe = await post(douglas, '/tasks/people', {
      id: randomUUID(),
      name: 'TMX member',
      userId: 'member',
      clickupId: null,
      discordId: null,
    });
    expect(safe.statusCode, safe.body).toBe(201);
    expect(safe.json().discordId).toBeNull();
  });
});
