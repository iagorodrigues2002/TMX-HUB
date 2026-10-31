import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { CallCreateSchema, callReminderIsDue } from '@page-cloner/shared';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { callAutomationRoutes, callManagementRoutes } from '../src/routes/call-management.js';
vi.hoisted(() => {
  process.env.JWT_SECRET ??= 'synthetic-call-tests-only-at-least-32-characters';
  process.env.TASK_AUTOMATION_SECRET = 'synthetic-call-automation-secret-123456789';
});
const secret = 'synthetic-call-automation-secret-123456789';
async function appFor(db: unknown, role?: 'admin' | 'user', sub = 'admin') {
  const app = Fastify();
  app.decorate('db', db);
  if (role)
    app.addHook('preHandler', async (req) => {
      req.user = { sub, role, email: 'qa@example.test', iat: 0, exp: 0 };
    });
  await app.register(callManagementRoutes);
  await app.register(callAutomationRoutes);
  return app;
}
it('requires authentication, admin management and separate automation credentials', async () => {
  const db = vi.fn();
  for (const role of [undefined, 'user'] as const) {
    const app = await appFor(db, role);
    expect((await app.inject('/calls')).statusCode).toBe(role ? 403 : 401);
    expect((await app.inject({ method: 'POST', url: '/calls', payload: {} })).statusCode).toBe(
      role ? 403 : 401,
    );
    await app.close();
  }
  const app = await appFor(db, 'admin');
  expect((await app.inject({ method: 'POST', url: '/call-automation/claim' })).statusCode).toBe(
    401,
  );
  expect(db).not.toHaveBeenCalled();
  await app.close();
});
it('validates meeting links and does not replay old reminders', () => {
  expect(CallCreateSchema.shape.meetingUrl.safeParse('javascript:alert(1)').success).toBe(false);
  expect(CallCreateSchema.shape.meetingUrl.safeParse('https://secret@example.com').success).toBe(
    false,
  );
  const now = Date.now();
  expect(callReminderIsDue(new Date(now + 300000).toISOString(), 5, now)).toBe(true);
  expect(callReminderIsDue(new Date(now - 300000).toISOString(), 0, now)).toBe(false);
});
const url = process.env.TASK_TEST_DATABASE_URL;
describe.skipIf(!url)('calls on disposable Postgres', () => {
  let db: ReturnType<typeof postgres>;
  beforeAll(async () => {
    const u = new URL(url!);
    if (
      u.hostname !== '127.0.0.1' ||
      u.pathname !== '/tmx_tasks_test' ||
      u.username !== 'tmx_tasks_test'
    )
      throw Error('Refusing non-disposable database');
    db = postgres(url!, { max: 5, onnotice: () => {} });
    for (const file of ['105_task_management.sql', '106_call_management.sql'])
      await db.unsafe(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
  });
  beforeEach(async () => {
    await db`TRUNCATE managed_call_notifications,managed_call_reminders,managed_call_commands,managed_calls,managed_task_people CASCADE`;
  });
  afterAll(async () => {
    await db?.end();
  });
  it('deduplicates creation and receipts, delivers private reminders and supersedes reschedules', async () => {
    const person = {
      id: randomUUID(),
      name: 'QA',
      clickupId: '123',
      discordId: '456',
      userId: 'member-1',
    };
    await db`INSERT INTO managed_task_people(id,clickup_id,discord_id,body) VALUES(${person.id},'123','456',${db.json(person)})`;
    const app = await appFor(db, 'admin');
    const input = {
      title: 'Call QA',
      startsAt: new Date(Date.now() + 300000).toISOString(),
      meetingUrl: 'https://meet.google.com/qa',
      participantIds: [person.id],
      reminderMinutes: [5, 0],
    };
    const key = randomUUID();
    const create = () =>
      app.inject({
        method: 'POST',
        url: '/calls',
        headers: { 'idempotency-key': key },
        payload: input,
      });
    const first = await create();
    expect(first.statusCode).toBe(202);
    const call = first.json();
    expect((await create()).json().id).toBe(call.id);
    expect((await db`SELECT * FROM managed_calls`).length).toBe(1);
    const auth = { 'x-tmx-task-secret': secret };
    const claim = () =>
      app.inject({ method: 'POST', url: '/call-automation/claim', headers: auth });
    expect((await claim()).json().commands[0].call.id).toBe(call.id);
    expect((await claim()).json().commands).toEqual([]);
    const result = {
      id: key,
      revision: 1,
      ok: true,
      clickupId: 'task123',
      discordMessageId: '777',
      discordChannelId: '888',
    };
    const confirm = () =>
      app.inject({
        method: 'POST',
        url: '/call-automation/result',
        headers: auth,
        payload: result,
      });
    expect((await confirm()).statusCode).toBe(200);
    expect((await confirm()).json().duplicate).toBe(true);
    const reminders = (await claim()).json().commands;
    expect(reminders).toHaveLength(1);
    expect(reminders[0].action).toBe('remind');
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/calls/${call.id}/cancel`,
          headers: { 'idempotency-key': randomUUID() },
          payload: { revision: 1 },
        })
      ).statusCode,
    ).toBe(409);
    const receipt = await app.inject({
      method: 'POST',
      url: '/call-automation/result',
      headers: auth,
      payload: {
        id: reminders[0].id,
        revision: 1,
        ok: true,
        discordMessageId: '999',
        discordChannelId: '888',
      },
    });
    expect(receipt.statusCode).toBe(200);
    const member = await appFor(db, 'user', 'member-1');
    const other = await appFor(db, 'user', 'member-2');
    const notices = (await member.inject('/calls/notifications')).json().notifications;
    expect(notices).toHaveLength(1);
    expect((await other.inject('/calls/notifications')).json().notifications).toEqual([]);
    await other.inject({
      method: 'POST',
      url: `/calls/notifications/${encodeURIComponent(notices[0].id)}/read`,
    });
    expect((await member.inject('/calls/notifications')).json().notifications).toHaveLength(1);
    await member.inject({
      method: 'POST',
      url: `/calls/notifications/${encodeURIComponent(notices[0].id)}/read`,
    });
    expect((await member.inject('/calls/notifications')).json().notifications).toEqual([]);
    const edit = await app.inject({
      method: 'PUT',
      url: `/calls/${call.id}`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { ...input, revision: 1, startsAt: new Date(Date.now() + 3600000).toISOString() },
    });
    expect(edit.statusCode).toBe(202);
    expect(edit.json().revision).toBe(2);
    expect((await db`SELECT * FROM managed_call_reminders WHERE state='superseded'`).length).toBe(
      1,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/call-automation/result',
          headers: auth,
          payload: result,
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/calls/${call.id}/cancel`,
          headers: { 'idempotency-key': randomUUID() },
          payload: { revision: 1 },
        })
      ).statusCode,
    ).toBe(409);
    const cancelled = await app.inject({
      method: 'POST',
      url: `/calls/${call.id}/cancel`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { revision: 2 },
    });
    expect(cancelled.statusCode).toBe(202);
    expect(cancelled.json().status).toBe('cancelled');
    await Promise.all([app.close(), member.close(), other.close()]);
  });
  it('skips a call locked by an edit and leases a command to only one concurrent worker', async () => {
    const person = { id: randomUUID(), name: 'QA', clickupId: '123', discordId: '456' };
    await db`INSERT INTO managed_task_people(id,body) VALUES(${person.id},${db.json(person)})`;
    const app = await appFor(db, 'admin');
    const call = (
      await app.inject({
        method: 'POST',
        url: '/calls',
        headers: { 'idempotency-key': randomUUID() },
        payload: {
          title: 'Concurrent QA',
          startsAt: new Date(Date.now() + 3600000).toISOString(),
          meetingUrl: 'https://meet.google.com/qa',
          participantIds: [person.id],
        },
      })
    ).json();
    const claim = () =>
      app.inject({
        method: 'POST',
        url: '/call-automation/claim',
        headers: { 'x-tmx-task-secret': secret },
      });
    await db.begin(async (tx) => {
      await tx`SELECT id FROM managed_calls WHERE id=${call.id} FOR UPDATE`;
      expect((await claim()).json().commands).toEqual([]);
    });
    const receipts = await Promise.all([claim(), claim()]);
    expect(receipts.flatMap((r) => r.json().commands)).toHaveLength(1);
    await app.close();
  });
  it('quarantines claimed work and preserves ClickUp identity after a Discord failure', async () => {
    const person = { id: randomUUID(), name: 'QA', clickupId: '123', discordId: '456' };
    await db`INSERT INTO managed_task_people(id,body) VALUES(${person.id},${db.json(person)})`;
    const app = await appFor(db, 'admin');
    const key = randomUUID();
    const input = {
      title: 'Failure QA',
      startsAt: new Date(Date.now() + 3600000).toISOString(),
      meetingUrl: 'https://meet.google.com/qa',
      participantIds: [person.id],
    };
    const call = (
      await app.inject({
        method: 'POST',
        url: '/calls',
        headers: { 'idempotency-key': key },
        payload: input,
      })
    ).json();
    const auth = { 'x-tmx-task-secret': secret };
    await app.inject({ method: 'POST', url: '/call-automation/claim', headers: auth });
    const checkpoint = () =>
      app.inject({
        method: 'POST',
        url: '/call-automation/checkpoint',
        headers: auth,
        payload: { id: key, revision: 1, clickupId: 'real-task' },
      });
    expect((await checkpoint()).statusCode).toBe(200);
    expect((await checkpoint()).statusCode).toBe(200);
    expect((await db`SELECT state FROM managed_call_commands WHERE id=${key}`)[0]!.state).toBe(
      'processing',
    );
    expect(
      (await app.inject({ method: 'POST', url: '/call-automation/claim', headers: auth })).json()
        .commands,
    ).toEqual([]);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/call-automation/checkpoint',
          headers: auth,
          payload: { id: key, revision: 1, clickupId: 'wrong-task' },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/call-automation/checkpoint',
          headers: auth,
          payload: { id: key, revision: 2, clickupId: 'real-task' },
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/calls/${call.id}/cancel`,
          headers: { 'idempotency-key': randomUUID() },
          payload: { revision: 1 },
        })
      ).statusCode,
    ).toBe(409);
    const failed = await app.inject({
      method: 'POST',
      url: '/call-automation/result',
      headers: auth,
      payload: { id: key, revision: 1, ok: false, clickupId: 'real-task' },
    });
    expect(failed.statusCode).toBe(200);
    const [saved] = await db`SELECT body FROM managed_calls WHERE id=${call.id}`;
    expect(saved!.body.clickupId).toBe('real-task');
    expect(saved!.body.syncState).toBe('failed');
    expect((await db`SELECT * FROM managed_call_reminders`).length).toBe(0);
    const edit = await app.inject({
      method: 'PUT',
      url: `/calls/${call.id}`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { ...input, revision: 1 },
    });
    expect(edit.statusCode).toBe(202);
    expect(edit.json().clickupId).toBe('real-task');
    await app.close();
  });
});
