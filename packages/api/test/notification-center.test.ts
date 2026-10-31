import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ManagedTask } from '@page-cloner/shared';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationCenterRoutes } from '../src/routes/notification-center.js';
vi.hoisted(() => {
  process.env.JWT_SECRET ??= 'synthetic-center-tests-only-at-least-32-characters';
  process.env.TASK_AUTOMATION_SECRET = 'synthetic-center-tests-only-automation-secret';
});
async function appFor(db: unknown, sub?: string, role: 'admin' | 'user' = 'user') {
  const app = Fastify();
  app.decorate('db', db);
  app.decorate('offerStore', {
    listAccessible: async (id: string) => [
      { id: id === 'member-1' ? 'offer-1' : 'offer-2', name: 'QA offer', userId: id },
    ],
  });
  app.decorate('userStore', { maybeGetById: async () => ({ name: 'QA Operator' }) });
  if (sub)
    app.addHook('preHandler', async (req) => {
      req.user = { sub, role, email: 'qa@example.test', iat: 0, exp: 0 };
    });
  await app.register(notificationCenterRoutes);
  return app;
}
it('rejects anonymous central access without touching storage', async () => {
  const db = vi.fn();
  const app = await appFor(db);
  for (const url of ['/notifications', '/notifications/read'])
    expect(
      (
        await app.inject({
          method: url.endsWith('/read') ? 'POST' : 'GET',
          url,
          payload: url.endsWith('/read') ? { ids: [] } : undefined,
        })
      ).statusCode,
    ).toBe(401);
  expect(db).not.toHaveBeenCalled();
  await app.close();
});
const testUrl = process.env.TASK_TEST_DATABASE_URL;
describe.skipIf(!testUrl)('real central isolated Postgres', () => {
  let db: ReturnType<typeof postgres>;
  beforeAll(async () => {
    const u = new URL(testUrl!);
    if (
      u.hostname !== '127.0.0.1' ||
      u.pathname !== '/tmx_tasks_test' ||
      u.username !== 'tmx_tasks_test'
    )
      throw Error('Refusing non-disposable database');
    db = postgres(testUrl!, { max: 5, onnotice: () => {} });
    for (const file of [
      '105_task_management.sql',
      '106_call_management.sql',
      '107_notification_center.sql',
    ])
      await db.unsafe(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    await db`CREATE TABLE IF NOT EXISTS tracking_projects(id text PRIMARY KEY,offer_id text NOT NULL)`;
    await db`CREATE TABLE IF NOT EXISTS tracking_orders(id text PRIMARY KEY,project_id text,status text,provider text,amount_minor text,currency text,order_kind text,occurred_at timestamptz)`;
    await db`CREATE TABLE IF NOT EXISTS tracking_upsell_operator_credits(order_id text PRIMARY KEY,operator_id text)`;
  });
  beforeEach(async () => {
    await db`TRUNCATE notification_center_reads,managed_call_notifications,managed_call_reminders,managed_call_commands,managed_calls,managed_task_commands,managed_task_events,managed_tasks,managed_task_people,tracking_upsell_operator_credits,tracking_orders,tracking_projects CASCADE`;
  });
  afterAll(async () => {
    await db?.end();
  });
  it('isolates tasks and sales per user, hides read sales and keeps read tasks until completion', async () => {
    const person = {
      id: randomUUID(),
      name: 'QA',
      clickupId: '123',
      discordId: '456',
      userId: 'member-1',
    };
    await db`INSERT INTO managed_task_people(id,body) VALUES(${person.id},${db.json(person)})`;
    const at = new Date().toISOString();
    const task: ManagedTask = {
      id: randomUUID(),
      clickupId: 'task-1',
      discordMessageId: '777',
      discordChannelId: '888',
      title: 'QA task',
      description: '',
      sector: 'Spy',
      offer: null,
      assignees: [person],
      status: 'pending',
      priority: 'normal',
      source: 'clickup',
      receivedAt: at,
      assignedAt: null,
      assignmentReceivedAt: {},
      startedAt: null,
      completedAt: null,
      dueAt: null,
      updatedAt: at,
      syncState: 'synced',
      discordState: 'synced',
    };
    await db`INSERT INTO managed_tasks(id,body) VALUES(${task.id},${db.json(task)})`;
    await db`INSERT INTO tracking_projects(id,offer_id) VALUES('p1','offer-1'),('p2','offer-2')`;
    await db`INSERT INTO tracking_orders(id,project_id,status,provider,amount_minor,currency,order_kind,occurred_at) VALUES('sale-1','p1','paid','vendepay','1000','BRL','front',now()),('sale-2','p2','paid','syzepay','2000','BRL','upsell',now()),('refund-1','p1','refunded','vendepay','1000','BRL','front',now())`;
    const one = await appFor(db, 'member-1');
    const two = await appFor(db, 'member-2');
    const admin = await appFor(db, 'admin', 'admin');
    const first = (await one.inject('/notifications')).json().notifications;
    expect(first).toHaveLength(2);
    expect(first.some((n: { id: string }) => n.id === 'sale:sale-1')).toBe(true);
    expect(
      (await two.inject('/notifications')).json().notifications.map((n: { id: string }) => n.id),
    ).toEqual(['sale:sale-2']);
    expect(
      (await admin.inject('/notifications'))
        .json()
        .notifications.some((n: { kind: string }) => n.kind === 'task'),
    ).toBe(false);
    expect(
      (
        await one.inject({
          method: 'POST',
          url: '/notifications/read',
          payload: { ids: first.map((n: { id: string }) => n.id) },
        })
      ).statusCode,
    ).toBe(200);
    const after = (await one.inject('/notifications')).json().notifications;
    expect(after).toHaveLength(1);
    expect(after[0].kind).toBe('task');
    expect(after[0].unread).toBe(false);
    expect((await two.inject('/notifications')).json().notifications).toHaveLength(1);
    const forbidden = await two.inject({
      method: 'POST',
      url: `/notifications/tasks/${task.id}/status`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { status: 'done' },
    });
    expect(forbidden.statusCode).toBe(404);
    const key = randomUUID();
    const change = () =>
      one.inject({
        method: 'POST',
        url: `/notifications/tasks/${task.id}/status`,
        headers: { 'idempotency-key': key },
        payload: { status: 'done' },
      });
    expect((await change()).statusCode).toBe(202);
    expect((await change()).statusCode).toBe(202);
    expect((await db`SELECT * FROM managed_task_commands`).length).toBe(1);
    expect((await one.inject('/notifications')).json().notifications[0].task.status).toBe(
      'pending',
    );
    await db`UPDATE managed_tasks SET body=jsonb_set(body,'{status}','"done"') WHERE id=${task.id}`;
    expect((await one.inject('/notifications')).json().notifications).toEqual([]);
    await two.inject({ method: 'POST', url: '/notifications/clear-sales', payload: { all: true } });
    expect((await two.inject('/notifications')).json().notifications).toEqual([]);
    expect((await db`SELECT * FROM tracking_orders`).length).toBe(3);
    await Promise.all([one.close(), two.close(), admin.close()]);
  });
});
