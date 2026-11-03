import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env.js';
import { callManagementRoutes } from '../src/routes/call-management.js';
import { nativeTaskAutomationRoutes } from '../src/routes/native-task-automation.js';
import { notificationCenterRoutes } from '../src/routes/notification-center.js';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'synthetic-native-call-tests-only-at-least-32';
  process.env.TASK_MANAGEMENT_MODE = 'native';
  process.env.TASK_AUTOMATION_SECRET = 'synthetic-native-call-bridge-secret-12345';
});
const secret = 'synthetic-native-call-bridge-secret-12345';
describe.skipIf(!process.env.TASK_TEST_DATABASE_URL)('native calls in isolated Postgres', () => {
  const schema = `native_calls_${randomUUID().replaceAll('-', '')}`;
  const personId = randomUUID();
  const companyId = randomUUID();
  let db: ReturnType<typeof postgres>;
  let root: ReturnType<typeof postgres>;
  async function appFor(sub = 'admin', role: 'admin' | 'user' = 'admin') {
    const app = Fastify();
    app.decorate('db', db);
    app.decorate('redis', { get: async () => null });
    app.decorate('offerStore', { listAccessible: async () => [] });
    app.addHook('preHandler', async (req) => {
      req.user = { sub, role, email: 'qa@example.test', iat: 0, exp: 0 };
    });
    await app.register(callManagementRoutes);
    await app.register(nativeTaskAutomationRoutes);
    await app.register(notificationCenterRoutes);
    return app;
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
    for (const f of [
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
    ])
      await db.unsafe(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  });
  beforeEach(async () => {
    env.TASK_AUTOMATION_SECRET = secret;
    env.TASK_DISCORD_CHANNELS_JSON = JSON.stringify({
      Calls: '789',
      [`${companyId}:Calls`]: '789',
    });
    await db`TRUNCATE managed_native_requests,managed_native_deliveries,managed_calls,managed_task_people CASCADE`;
    await db`INSERT INTO managed_task_people(id,body) VALUES(${personId},${db.json({ id: personId, name: 'QA member', userId: 'member', clickupId: null, discordId: null })})`;
    await db`INSERT INTO companies(id,name,created_by) VALUES(${companyId},'QA company','admin') ON CONFLICT DO NOTHING`;
    await db`INSERT INTO company_memberships(company_id,user_id,role) VALUES(${companyId},'member','member') ON CONFLICT(company_id,user_id) DO UPDATE SET status='active'`;
  });
  afterAll(async () => {
    await db?.end();
    await root?.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await root?.end();
  });
  async function input() {
    const [row] =
      await db`SELECT (clock_timestamp()+interval '4 minutes 59 seconds')::text starts_at`;
    return {
      companyId,
      title: 'Call nativa QA',
      description: 'Sem ClickUp',
      message: 'Mensagem de lembrete QA',
      startsAt: new Date(row.starts_at).toISOString(),
      durationMinutes: 60,
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      participantIds: [personId],
      reminderMinutes: [5, 0],
    };
  }
  it('shows uncertain Discord delivery separately and restricts native call management to admins', async () => {
    const app = await appFor();
    const member = await appFor('member', 'user');
    const made = await app.inject({
      method: 'POST',
      url: '/calls',
      headers: { 'idempotency-key': randomUUID() },
      payload: await input(),
    });
    expect(made.statusCode).toBe(201);
    await db`UPDATE managed_native_deliveries SET state='uncertain' WHERE entity_kind='call' AND entity_id=${made.json().id}`;
    expect((await app.inject('/calls')).json().calls[0]).toMatchObject({
      status: 'scheduled',
      syncState: 'synced',
      discordState: 'failed',
    });
    expect((await member.inject('/calls')).statusCode).toBe(403);
    await Promise.all([app.close(), member.close()]);
  });
  it('keeps one scheduled call in the central after reading, exclusively for current participants', async () => {
    const admin = await appFor();
    const member = await appFor('member', 'user');
    const other = await appFor('other', 'user');
    try {
      const payload = { ...(await input()), startsAt: '2099-11-02T17:00:00.000Z' };
      const made = await admin.inject({
        method: 'POST',
        url: '/calls',
        headers: { 'idempotency-key': randomUUID() },
        payload,
      });
      expect(made.statusCode).toBe(201);
      const call = made.json();
      const list = async () => (await member.inject('/notifications')).json().notifications;
      const first = await list();
      expect(first).toHaveLength(1);
      expect(first[0]).toMatchObject({
        kind: 'call',
        unread: true,
        title: payload.title,
        call: { callId: call.id, startsAt: payload.startsAt },
      });
      for (const viewer of [admin, other])
        expect((await viewer.inject('/notifications')).json().notifications).toEqual([]);
      await member.inject({
        method: 'POST',
        url: '/notifications/read',
        payload: { ids: [first[0].id] },
      });
      expect(await list()).toMatchObject([{ id: first[0].id, unread: false }]);
      await member.inject({
        method: 'POST',
        url: '/notifications/clear-sales',
        payload: { all: true },
      });
      expect(await list()).toHaveLength(1);
      await db`UPDATE managed_calls SET body=jsonb_set(jsonb_set(body,'{title}','"Reagendada"'),'{revision}','2') WHERE id=${call.id}`;
      expect(await list()).toMatchObject([{ title: 'Reagendada', unread: true }]);
      await db`UPDATE managed_calls SET body=jsonb_set(body,'{participants}','[]') WHERE id=${call.id}`;
      expect(await list()).toEqual([]);
      await db`UPDATE managed_calls SET body=${db.json(call)} WHERE id=${call.id}`;
      for (const status of ['cancelled', 'completed']) {
        await db`UPDATE managed_calls SET body=jsonb_set(body,'{status}',${db.json(status)}) WHERE id=${call.id}`;
        expect(await list()).toEqual([]);
      }
    } finally {
      await Promise.all([admin.close(), member.close(), other.close()]);
    }
  });
  it('creates and edits native calls without any ClickUp or Discord participant ID', async () => {
    env.TASK_AUTOMATION_SECRET = undefined;
    const app = await appFor();
    const payload = await input();
    const key = randomUUID();
    const create = () =>
      app.inject({ method: 'POST', url: '/calls', headers: { 'idempotency-key': key }, payload });
    const first = await create();
    expect(first.statusCode).toBe(201);
    expect(first.json()).toMatchObject({
      managementMode: 'native',
      clickupId: null,
      revision: 1,
      syncState: 'synced',
    });
    expect((await create()).json()).toEqual(first.json());
    const updated = await app.inject({
      method: 'PUT',
      url: `/calls/${first.json().id}`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { ...payload, title: 'Call reagendada', revision: 1 },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().revision).toBe(2);
    expect((await db`SELECT id FROM managed_calls`).length).toBe(1);
    expect((await db`SELECT id FROM managed_call_commands`).length).toBe(0);
    await app.close();
  });
  it('notifies only participants for due reminders and cancels the old revision', async () => {
    const app = await appFor();
    const member = await appFor('member', 'user');
    const other = await appFor('other', 'user');
    const made = await app.inject({
      method: 'POST',
      url: '/calls',
      headers: { 'idempotency-key': randomUUID() },
      payload: await input(),
    });
    expect(made.statusCode).toBe(201);
    const call = made.json();
    const claim = await app.inject({
      method: 'POST',
      url: '/native-task-automation/claim',
      headers: { 'x-tmx-task-secret': secret },
    });
    expect(claim.statusCode).toBe(200);
    expect((await member.inject('/calls/notifications')).json().notifications).toHaveLength(1);
    expect((await other.inject('/calls/notifications')).json().notifications).toEqual([]);
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
    for (const d of claim.json().deliveries) {
      expect(
        (
          await app.inject({
            method: 'POST',
            url: '/native-task-automation/result',
            headers: { 'x-tmx-task-secret': secret },
            payload: {
              id: d.id,
              leaseId: d.leaseId,
              revision: d.revision,
              outcome: 'confirmed',
              messageId: d.entityKind === 'reminder' ? '888' : '777',
              channelId: '789',
            },
          })
        ).statusCode,
      ).toBe(200);
    }
    const cancel = await app.inject({
      method: 'POST',
      url: `/calls/${call.id}/cancel`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { revision: 1 },
    });
    expect(cancel.statusCode).toBe(200);
    expect(cancel.json().status).toBe('cancelled');
    expect((await member.inject('/calls/notifications')).json().notifications).toEqual([]);
    const [old] =
      await db`SELECT count(*)::int n FROM managed_native_deliveries WHERE entity_kind='reminder' AND state='queued'`;
    expect(old.n).toBe(0);
    await Promise.all([app.close(), member.close(), other.close()]);
  });
});
