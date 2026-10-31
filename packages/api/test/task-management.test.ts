import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResilientPostgresClient } from '../src/lib/postgres-retry.js';
import {
  taskAutomationRoutes,
  taskManagementRoutes,
  validTaskBridgeSecret,
} from '../src/routes/task-management.js';

vi.hoisted(() => {
  process.env.JWT_SECRET ??= 'synthetic-task-tests-only-at-least-32-characters';
  process.env.TASK_AUTOMATION_SECRET = 'synthetic-task-automation-test-secret-12345';
});

const secret = 'synthetic-task-automation-test-secret-12345';
async function appFor(role?: 'admin' | 'user', db: unknown = null) {
  const app = Fastify();
  app.decorate('db', db);
  if (role)
    app.addHook('preHandler', async (req) => {
      req.user = { sub: 'fixture-admin', role, email: 'admin@example.test', iat: 0, exp: 0 };
    });
  await app.register(taskManagementRoutes);
  await app.register(taskAutomationRoutes);
  return app;
}

it('rejects unauthenticated and non-admin callers before touching any task storage', async () => {
  const db = vi.fn();
  for (const role of [undefined, 'user'] as const) {
    const app = await appFor(role, db);
    for (const method of ['GET', 'POST'] as const)
      expect((await app.inject({ method, url: '/tasks' })).statusCode).toBe(role ? 403 : 401);
    expect(
      (await app.inject({ method: 'POST', url: '/tasks/people', payload: {} })).statusCode,
    ).toBe(role ? 403 : 401);
    expect(
      (
        await app.inject({
          method: 'PATCH',
          url: `/tasks/${randomUUID()}/status`,
          payload: { status: 'done' },
        })
      ).statusCode,
    ).toBe(role ? 403 : 401);
    await app.close();
  }
  expect(db).not.toHaveBeenCalled();
});
it('automation credentials are separate from admin authentication', async () => {
  const db = vi.fn();
  const app = await appFor('admin', db);
  expect(
    (await app.inject({ method: 'POST', url: '/task-automation/commands/claim' })).statusCode,
  ).toBe(401);
  expect(validTaskBridgeSecret(secret, secret)).toBe(true);
  expect(validTaskBridgeSecret([secret], secret)).toBe(false);
  expect(validTaskBridgeSecret('wrong', secret)).toBe(false);
  expect(validTaskBridgeSecret(secret, undefined)).toBe(false);
  expect(db).not.toHaveBeenCalled();
  await app.close();
});

const testUrl = process.env.TASK_TEST_DATABASE_URL;
describe.skipIf(!testUrl)('isolated Postgres task lifecycle', () => {
  let db: ReturnType<typeof postgres>;
  beforeAll(async () => {
    const url = new URL(testUrl!);
    if (
      url.hostname !== '127.0.0.1' ||
      url.pathname !== '/tmx_tasks_test' ||
      url.username !== 'tmx_tasks_test'
    )
      throw new Error('Refusing non-disposable test database');
    db = postgres(testUrl!, { max: 5, onnotice: () => {} });
    await db.unsafe(
      readFileSync(new URL('../migrations/105_task_management.sql', import.meta.url), 'utf8'),
    );
  });
  beforeEach(async () => {
    await db`TRUNCATE managed_task_events,managed_task_commands,managed_tasks,managed_task_people`;
  });
  afterAll(async () => {
    await db?.end();
  });
  it('lists tasks through the same resilient database client used by the application', async () => {
    const app = await appFor('admin', createResilientPostgresClient(db, { delaysMs: [] }));
    const response = await app.inject('/tasks');
    expect(response.statusCode).toBe(200);
    expect(response.json().total).toBe(0);
    await app.close();
  });
  it('links private notices only to existing, uniquely mapped TMX accounts', async () => {
    const app = await appFor('admin', db);
    app.decorate('userStore', {
      getById: async (id: string) => (id === 'fixture-admin' ? { id } : null),
    });
    const person = {
      id: randomUUID(),
      name: 'QA account',
      clickupId: '991',
      discordId: '992',
      userId: 'unknown',
    };
    expect(
      (await app.inject({ method: 'POST', url: '/tasks/people', payload: person })).statusCode,
    ).toBe(400);
    person.userId = 'fixture-admin';
    expect(
      (await app.inject({ method: 'POST', url: '/tasks/people', payload: person })).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/tasks/people',
          payload: { ...person, id: randomUUID(), clickupId: '993', discordId: '994' },
        })
      ).statusCode,
    ).toBe(409);
    await app.close();
  });
  it('rejects conflicting provider identities without a server error or replacing a person', async () => {
    const app = await appFor('admin', db);
    const person = { id: randomUUID(), name: 'QA Person', clickupId: '123', discordId: '456' };
    expect(
      (await app.inject({ method: 'POST', url: '/tasks/people', payload: person })).statusCode,
    ).toBe(201);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/tasks/people',
          payload: { ...person, id: randomUUID() },
        })
      ).statusCode,
    ).toBe(409);
    expect((await app.inject('/tasks/people')).json().people).toEqual([person]);
    await app.close();
  });
  it('serializes create retries, rejects key reuse and never leases the same command twice', async () => {
    const app = await appFor('admin', db);
    const person = { id: randomUUID(), name: 'QA Person', clickupId: '123', discordId: '456' };
    expect(
      (await app.inject({ method: 'POST', url: '/tasks/people', payload: person })).statusCode,
    ).toBe(201);
    const key = randomUUID();
    const payload = {
      title: 'QA task',
      description: '',
      sector: 'Spy',
      offer: null,
      assigneeIds: [person.id],
      priority: 'normal',
      dueAt: null,
    };
    const request = {
      method: 'POST' as const,
      url: '/tasks',
      headers: { 'idempotency-key': key },
      payload,
    };
    const results = await Promise.all([app.inject(request), app.inject(request)]);
    expect(results.map((r) => r.statusCode)).toEqual([202, 202]);
    expect(results[0]!.json().id).toBe(results[1]!.json().id);
    expect((await db`SELECT id FROM managed_tasks`).length).toBe(1);
    expect(
      (await app.inject({ ...request, payload: { ...payload, title: 'Different intent' } }))
        .statusCode,
    ).toBe(409);
    const claim = {
      method: 'POST' as const,
      url: '/task-automation/commands/claim',
      headers: { 'x-tmx-task-secret': secret },
    };
    expect((await app.inject(claim)).json().commands).toHaveLength(1);
    expect((await app.inject(claim)).json().commands).toHaveLength(0);
    await app.close();
  });
  it('keeps global totals and per-person workload independent of pagination and filters', async () => {
    const app = await appFor('admin', db);
    const person = { id: randomUUID(), name: 'QA Person', clickupId: '123', discordId: '456' };
    await app.inject({ method: 'POST', url: '/tasks/people', payload: person });
    const created = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { 'idempotency-key': randomUUID() },
      payload: {
        title: 'QA task',
        sector: 'Spy',
        offer: null,
        assigneeIds: [person.id],
        priority: 'normal',
        dueAt: null,
      },
    });
    for (let index = 0; index < 51; index++) {
      const task = {
        ...created.json(),
        id: randomUUID(),
        status: index < 10 ? 'done' : 'progress',
      };
      await db`INSERT INTO managed_tasks(id,body) VALUES(${task.id},${db.json(task)})`;
    }
    const page = (await app.inject('/tasks?page=2&limit=50')).json();
    expect(page.tasks).toHaveLength(2);
    expect(page.total).toBe(52);
    expect(page.summary).toMatchObject({ open: 42, progress: 41, done: 10 });
    expect(page.peopleSummary[0]).toMatchObject({ id: person.id, open: 42, done: 10 });
    const filtered = (await app.inject('/tasks?status=done')).json();
    expect(filtered.tasks).toHaveLength(10);
    expect(filtered.summary.open).toBe(42);
    expect((await app.inject('/tasks?q=QA%20Person')).json().total).toBe(52);
    expect((await app.inject('/tasks?page=3')).json().total).toBe(52);
    expect((await app.inject('/tasks?status=unknown')).statusCode).toBe(422);
    await app.close();
  });
  it('deduplicates canonical events, ignores old status and requires both confirmations', async () => {
    const app = await appFor('admin', db);
    const headers = { 'x-tmx-task-secret': secret };
    const person = { id: randomUUID(), name: 'QA Person', clickupId: '123', discordId: '456' };
    await app.inject({ method: 'POST', url: '/tasks/people', payload: person });
    const key = randomUUID();
    const created = await app.inject({
      method: 'POST',
      url: '/tasks',
      headers: { 'idempotency-key': key },
      payload: {
        title: 'QA task',
        sector: 'Spy',
        offer: null,
        assigneeIds: [person.id],
        priority: 'normal',
        dueAt: null,
      },
    });
    const at = new Date().toISOString();
    const task = {
      ...created.json(),
      clickupId: 'qa123',
      updatedAt: at,
      syncState: 'synced',
      discordState: 'pending',
    };
    const event = { eventId: `${key}:clickup`, task };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/task-automation/events',
          headers,
          payload: event,
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/task-automation/events',
          headers,
          payload: event,
        })
      ).json().duplicate,
    ).toBe(true);
    const finish = {
      method: 'POST' as const,
      url: `/task-automation/commands/${key}/result`,
      headers,
      payload: { success: true },
    };
    expect((await app.inject(finish)).statusCode).toBe(409);
    const confirmed = {
      ...task,
      discordState: 'synced',
      discordMessageId: '777',
      discordChannelId: '888',
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/task-automation/events',
          headers,
          payload: { eventId: `${key}:discord`, task: confirmed },
        })
      ).statusCode,
    ).toBe(200);
    expect((await app.inject(finish)).statusCode).toBe(200);
    const older = {
      ...confirmed,
      updatedAt: new Date(Date.now() - 86400000).toISOString(),
      status: 'done',
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/task-automation/events',
          headers,
          payload: { eventId: 'old-event', task: older },
        })
      ).json().stale,
    ).toBe(true);
    expect((await app.inject('/tasks')).json().tasks[0].status).toBe('pending');
    expect((await db`SELECT state FROM managed_task_commands WHERE id=${key}`)[0]!.state).toBe(
      'succeeded',
    );
    await app.close();
  });
  it('completes a leased command from the single publisher callback and never downgrades its receipt', async () => {
    const app = await appFor('admin', db);
    const headers = { 'x-tmx-task-secret': secret };
    const person = { id: randomUUID(), name: 'QA Person', clickupId: '123', discordId: '456' };
    await app.inject({ method: 'POST', url: '/tasks/people', payload: person });
    const key = randomUUID();
    const created = (
      await app.inject({
        method: 'POST',
        url: '/tasks',
        headers: { 'idempotency-key': key },
        payload: {
          title: 'QA single publisher',
          sector: 'Spy',
          offer: null,
          assigneeIds: [person.id],
          priority: 'normal',
          dueAt: null,
        },
      })
    ).json();
    await app.inject({ method: 'POST', url: '/task-automation/commands/claim', headers });
    const task = {
      ...created,
      clickupId: 'qaSingle',
      updatedAt: new Date().toISOString(),
      syncState: 'synced',
      discordState: 'synced',
      discordMessageId: '777',
      discordChannelId: '888',
    };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/task-automation/events',
          headers,
          payload: { eventId: 'publisher-receipt', task },
        })
      ).statusCode,
    ).toBe(200);
    expect((await db`SELECT state FROM managed_task_commands WHERE id=${key}`)[0]!.state).toBe(
      'succeeded',
    );
    await app.inject({
      method: 'POST',
      url: '/task-automation/events',
      headers,
      payload: {
        eventId: 'late-worker-checkpoint',
        task: { ...task, discordState: 'pending', discordMessageId: null, discordChannelId: null },
      },
    });
    const saved = (await app.inject('/tasks')).json().tasks[0];
    expect(saved.discordState).toBe('synced');
    expect(saved.discordMessageId).toBe('777');
    await app.close();
  });
});
