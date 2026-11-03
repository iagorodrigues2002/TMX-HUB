import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { callAutomationRoutes } from '../src/routes/call-management.js';

vi.hoisted(() => {
  process.env.TASK_MANAGEMENT_MODE = 'native';
  process.env.JWT_SECRET ??= 'synthetic-call-cutover-tests-only-at-least-32-characters';
  process.env.TASK_AUTOMATION_SECRET = 'synthetic-call-cutover-automation-secret-123456789';
});
const headers = {
  'x-tmx-task-secret': 'synthetic-call-cutover-automation-secret-123456789',
};
const url = process.env.TASK_TEST_DATABASE_URL;

describe.skipIf(!url)('legacy call bridge during native cutover', () => {
  let db: ReturnType<typeof postgres>;
  const schema = `call_cutover_${randomUUID().replaceAll('-', '')}`;
  let app: ReturnType<typeof Fastify>;
  beforeAll(async () => {
    const target = new URL(url!);
    if (
      target.hostname !== '127.0.0.1' ||
      target.pathname !== '/tmx_tasks_test' ||
      target.username !== 'tmx_tasks_test'
    )
      throw Error('Refusing non-disposable database');
    db = postgres(url!, { max: 1, onnotice: () => {} });
    await db`CREATE SCHEMA ${db(schema)}`;
    await db`SET search_path TO ${db(schema)}`;
    for (const file of ['105_task_management.sql', '106_call_management.sql'])
      await db.unsafe(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    app = Fastify();
    app.decorate('db', db);
    await app.register(callAutomationRoutes);
  });
  beforeEach(async () => {
    await db`TRUNCATE managed_call_notifications,managed_call_reminders,managed_call_commands,managed_calls CASCADE`;
  });
  afterAll(async () => {
    await app?.close();
    if (db) {
      await db`DROP SCHEMA ${db(schema)} CASCADE`;
      await db.end();
    }
  });

  async function callFixture(managementMode?: 'clickup' | 'native') {
    const id = randomUUID();
    const body = {
      id,
      ...(managementMode ? { managementMode } : {}),
      title: 'Cutover fixture',
      revision: 1,
      startsAt: new Date(Date.now() + 3600000).toISOString(),
      status: 'scheduled',
      syncState: 'synced',
      clickupId: null,
      discordMessageId: '701',
      discordChannelId: '702',
      participants: [{ userId: 'participant', name: 'Fixture' }],
      reminderMinutes: [],
      meetingUrl: 'https://meet.google.com/fixture',
      message: 'Fixture reminder',
    };
    await db`INSERT INTO managed_calls(id,body) VALUES(${id},${db.json(body)})`;
    return body;
  }
  async function commandFixture(call: Awaited<ReturnType<typeof callFixture>>, state = 'queued') {
    const id = randomUUID();
    // Deliberately misleading body: eligibility must come from the persisted call, not this payload.
    const body = { id, action: 'create', call: { ...call, managementMode: 'clickup' } };
    await db`INSERT INTO managed_call_commands(id,call_id,revision,user_id,request_hash,body,state) VALUES(${id},${call.id},1,'admin','fixture',${db.json(body)},${state})`;
    return id;
  }
  async function reminderFixture(callId: string, state = 'queued') {
    const id = `${callId}:1:0`;
    await db`INSERT INTO managed_call_reminders(id,call_id,revision,minutes,due_at,state) VALUES(${id},${callId},1,0,now()-interval '10 seconds',${state})`;
    return id;
  }
  const claim = () => app.inject({ method: 'POST', url: '/call-automation/claim', headers });
  const result = (payload: Record<string, unknown>) =>
    app.inject({ method: 'POST', url: '/call-automation/result', headers, payload });

  it.each([undefined, 'clickup'] as const)(
    'continues legacy commands and due reminders in native mode (mode %s)',
    async (mode) => {
      const call = await callFixture(mode);
      const commandId = await commandFixture(call);
      const reminderId = await reminderFixture(call.id);
      const response = await claim();
      expect(response.statusCode).toBe(200);
      expect(
        response
          .json()
          .commands.map((item: { id: string }) => item.id)
          .sort(),
      ).toEqual([commandId, reminderId].sort());
      expect((await claim()).json().commands).toEqual([]);
      expect((await db`SELECT state FROM managed_call_commands`)[0]!.state).toBe('processing');
      expect((await db`SELECT state FROM managed_call_reminders`)[0]!.state).toBe('processing');
    },
  );

  it('excludes native commands and native reminder-only calls from both sides of the claim', async () => {
    const nativeCommand = await callFixture('native');
    const nativeReminderOnly = await callFixture('native');
    await commandFixture(nativeCommand);
    await reminderFixture(nativeReminderOnly.id);
    const legacy = await callFixture('clickup');
    const legacyId = await commandFixture(legacy);
    expect((await claim()).json().commands.map((item: { id: string }) => item.id)).toEqual([
      legacyId,
    ]);
    expect(
      (await db`SELECT state FROM managed_call_commands WHERE call_id=${nativeCommand.id}`)[0]!
        .state,
    ).toBe('queued');
    expect((await db`SELECT state FROM managed_call_reminders`)[0]!.state).toBe('queued');
  });

  it.each(['processing', 'succeeded'])(
    'rejects native checkpoint and receipts in state %s without mutations',
    async (state) => {
      const call = await callFixture('native');
      const commandId = await commandFixture(call, state);
      const reminderId = await reminderFixture(call.id, state);
      const checkpoint = await app.inject({
        method: 'POST',
        url: '/call-automation/checkpoint',
        headers,
        payload: { id: commandId, revision: 1, clickupId: 'forged' },
      });
      expect(checkpoint.statusCode).toBe(409);
      for (const id of [commandId, reminderId]) {
        const response = await result({
          id,
          revision: 1,
          ok: true,
          clickupId: 'forged',
          discordMessageId: '701',
          discordChannelId: '702',
        });
        expect(response.statusCode).toBe(409);
      }
      expect((await db`SELECT body FROM managed_calls WHERE id=${call.id}`)[0]!.body).toEqual(call);
      expect((await db`SELECT state FROM managed_call_commands`)[0]!.state).toBe(state);
      expect((await db`SELECT state FROM managed_call_reminders`)[0]!.state).toBe(state);
      expect(await db`SELECT * FROM managed_call_notifications`).toEqual([]);
    },
  );

  it('preserves checkpoint and receipt idempotency for legacy calls after native cutover', async () => {
    const call = await callFixture();
    const commandId = await commandFixture(call);
    const reminderId = await reminderFixture(call.id);
    await claim();
    for (let attempt = 0; attempt < 2; attempt++) {
      const checkpoint = await app.inject({
        method: 'POST',
        url: '/call-automation/checkpoint',
        headers,
        payload: { id: commandId, revision: 1, clickupId: 'legacy1' },
      });
      expect(checkpoint.statusCode).toBe(200);
    }
    for (const id of [commandId, reminderId]) {
      const payload = {
        id,
        revision: 1,
        ok: true,
        clickupId: 'legacy1',
        discordMessageId: '701',
        discordChannelId: '702',
      };
      expect((await result(payload)).json()).toEqual({ accepted: true, duplicate: false });
      expect((await result(payload)).json()).toEqual({ accepted: true, duplicate: true });
    }
    expect(await db`SELECT * FROM managed_call_notifications`).toHaveLength(1);
    expect((await db`SELECT body FROM managed_calls`)[0]!.body.clickupId).toBe('legacy1');
    expect((await claim()).json().commands).toEqual([]);
  });
});
