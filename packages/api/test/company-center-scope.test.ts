import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify, { type LightMyRequestResponse } from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { notificationCenterRoutes } from '../src/routes/notification-center.js';

vi.hoisted(() => {
  process.env.TASK_MANAGEMENT_MODE = 'native';
  process.env.JWT_SECRET ??= 'synthetic-center-scope-secret-32-characters';
});

describe.skipIf(!process.env.TASK_TEST_DATABASE_URL)('company assigned notifications', () => {
  const schema = `center_scope_${randomUUID().replaceAll('-', '')}`;
  const company = randomUUID();
  const foreign = randomUUID();
  const taskIds: Record<string, string> = {};
  let root: ReturnType<typeof postgres>;
  let db: ReturnType<typeof postgres>;
  async function request(actor: string): Promise<{ title: string; kind: string }[]>;
  async function request(
    actor: string,
    change: { id: string; key: string },
  ): Promise<LightMyRequestResponse>;
  async function request(actor: string, change?: { id: string; key: string }) {
    const app = Fastify();
    app.decorate('db', db);
    app.decorate('redis', { get: async () => null });
    app.decorate('offerStore', { listAccessible: async () => [] });
    app.decorate('userStore', { maybeGetById: async () => null });
    app.addHook('preHandler', async (req) => {
      req.user = {
        sub: actor,
        role: actor.startsWith('global') ? 'admin' : 'user',
        email: 'synthetic@test.invalid',
        tools: [],
        iat: 0,
        exp: 0,
      };
    });
    await app.register(notificationCenterRoutes);
    try {
      if (change)
        return await app.inject({
          method: 'POST',
          url: `/notifications/tasks/${change.id}/status`,
          headers: { 'idempotency-key': change.key },
          payload: { status: 'progress', revision: 1 },
        });
      const response = await app.inject('/notifications');
      expect(response.statusCode).toBe(200);
      return response.json().notifications as { title: string; kind: string }[];
    } finally {
      await app.close();
    }
  }
  beforeAll(async () => {
    const url = new URL(process.env.TASK_TEST_DATABASE_URL!);
    if (
      url.hostname !== '127.0.0.1' ||
      url.username !== 'tmx_tasks_test' ||
      url.pathname !== '/tmx_tasks_test'
    )
      throw Error('Only isolated test database');
    root = postgres(url.toString(), { max: 1, onnotice: () => {} });
    await root.unsafe(`CREATE SCHEMA ${schema}`);
    db = postgres(url.toString(), {
      max: 3,
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
    ])
      await db.unsafe(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    await db`INSERT INTO companies(id,name,created_by) VALUES(${company},'TMX QA','global'),(${foreign},'Other QA','other')`;
    await db`INSERT INTO company_memberships(company_id,user_id,role,status) VALUES(${company},'member','member','active'),(${foreign},'other','owner','active'),(${company},'suspended','member','suspended')`;
    const people = ['member', 'other', 'suspended', 'legacy', 'global'].map((userId) => ({
      id: randomUUID(),
      userId,
      name: userId,
    }));
    for (const person of people)
      await db`INSERT INTO managed_task_people(id,body) VALUES(${person.id},${db.json(person)})`;
    const now = new Date().toISOString();
    for (const [title, companyId] of [
      ['own', company],
      ['foreign', foreign],
      ['unbound', null],
    ] as const) {
      const task = {
        id: randomUUID(),
        title: `task-${title}`,
        companyId,
        managementMode: 'native',
        revision: 1,
        assignees: people,
        status: 'pending',
        updatedAt: now,
        startedAt: null,
        completedAt: null,
        discordChannelId: null,
        sector: 'Spy',
        offer: null,
      };
      taskIds[title] = task.id;
      await db`INSERT INTO managed_tasks(id,body) VALUES(${task.id},${db.json(task)})`;
      for (const managementMode of ['native', 'clickup']) {
        const call = {
          id: randomUUID(),
          title: `call-${title}-${managementMode}`,
          companyId,
          managementMode,
          participants: people,
          status: 'scheduled',
          startsAt: now,
          updatedAt: now,
          revision: 1,
          message: '',
          meetingUrl: 'https://meet.google.com/synthetic',
        };
        await db`INSERT INTO managed_calls(id,body) VALUES(${call.id},${db.json(call)})`;
      }
    }
  });
  afterAll(async () => {
    await db?.end();
    await root?.unsafe(`DROP SCHEMA ${schema} CASCADE`);
    await root?.end();
  });
  it('shows assigned company records but never another company or unbound legacy', async () => {
    expect((await request('member')).map((n) => n.title).sort()).toEqual([
      'call-own-clickup',
      'call-own-native',
      'task-own',
    ]);
    expect((await request('other')).map((n) => n.title).sort()).toEqual([
      'call-foreign-clickup',
      'call-foreign-native',
      'task-foreign',
    ]);
  });
  it('keeps legacy scheduled calls visible during native cutover without importing tasks', async () => {
    expect((await request('legacy')).map((n) => n.title).sort()).toEqual([
      'call-unbound-clickup',
      'call-unbound-native',
      'task-unbound',
    ]);
  });
  it('suspension does not reopen the legacy fallback', async () => {
    expect(await request('suspended')).toEqual([]);
  });
  it('global visibility still requires explicit participation', async () => {
    expect(await request('global')).toHaveLength(9);
    expect(await request('global-unassigned')).toEqual([]);
  });
  it('revocation removes access immediately despite stored assignments', async () => {
    const change = { id: taskIds.own, key: randomUUID() };
    const first = await request('member', change);
    expect('statusCode' in first && first.statusCode).toBe(200);
    const foreignChange = await request('member', { id: taskIds.foreign, key: randomUUID() });
    expect('statusCode' in foreignChange && foreignChange.statusCode).toBe(404);
    await db`UPDATE company_memberships SET status='suspended' WHERE user_id='member'`;
    expect(await request('member')).toEqual([]);
    const replay = await request('member', change);
    expect('statusCode' in replay && replay.statusCode).toBe(404);
    expect(await db`SELECT id FROM managed_native_requests`).toHaveLength(1);
  });
});
