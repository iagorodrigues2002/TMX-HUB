import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import Fastify from 'fastify';
import postgres from 'postgres';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { env } from '../src/env.js';
import { HttpProblem } from '../src/lib/problem.js';
import { callManagementRoutes } from '../src/routes/call-management.js';
import { notificationCenterRoutes } from '../src/routes/notification-center.js';

vi.hoisted(() => {
  process.env.JWT_SECRET = 'synthetic-manual-call-tests-only-at-least-32';
  process.env.TASK_MANAGEMENT_MODE = 'native';
});

describe.skipIf(!process.env.TASK_TEST_DATABASE_URL)(
  'manual call status on disposable Postgres',
  () => {
    const schema = `call_status_${randomUUID().replaceAll('-', '')}`;
    const companyId = randomUUID();
    const otherCompanyId = randomUUID();
    const personId = randomUUID();
    let root: ReturnType<typeof postgres>;
    let db: ReturnType<typeof postgres>;
    const apps: ReturnType<typeof Fastify>[] = [];

    async function appFor(
      sub = 'global',
      role: 'admin' | 'user' = sub === 'global' ? 'admin' : 'user',
    ) {
      const app = Fastify();
      app.decorate('db', db);
      app.decorate('redis', {
        get: async () => null,
        smembers: async () => [],
        lrange: async () => [],
      });
      app.decorate('offerStore', { listAccessible: async () => [] });
      app.addHook('preHandler', async (req) => {
        req.user = { sub, role, email: `${sub}@example.test`, iat: 0, exp: 0 };
      });
      app.setErrorHandler((error, _req, reply) =>
        reply.code(error instanceof HttpProblem ? error.status : 500).send({
          code: error instanceof HttpProblem ? error.code : 'unexpected',
        }),
      );
      await app.register(callManagementRoutes);
      await app.register(notificationCenterRoutes);
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
      ])
        await db.unsafe(readFileSync(new URL(`../migrations/${file}`, import.meta.url), 'utf8'));
    });
    beforeEach(async () => {
      env.TASK_MANAGEMENT_MODE = 'native';
      env.TASK_AUTOMATION_SECRET = undefined;
      await db`TRUNCATE managed_native_requests,managed_native_deliveries,managed_calls,managed_task_people,companies CASCADE`;
      await db`INSERT INTO companies(id,name,created_by) VALUES(${companyId},'QA company','global'),(${otherCompanyId},'Other QA','other')`;
      await db`INSERT INTO company_memberships(company_id,user_id,role) VALUES(${companyId},'manager','admin'),(${companyId},'participant','member'),(${otherCompanyId},'other','owner')`;
      await db`INSERT INTO managed_task_people(id,body) VALUES(${personId},${db.json({ id: personId, name: 'Participant', userId: 'participant', clickupId: null, discordId: null })})`;
    });
    afterAll(async () => {
      await Promise.all(apps.map((app) => app.close()));
      await db?.end();
      await root?.unsafe(`DROP SCHEMA ${schema} CASCADE`);
      await root?.end();
    });

    async function fixture(mode?: 'native' | 'clickup') {
      const id = randomUUID();
      const call = {
        id,
        companyId,
        ...(mode ? { managementMode: mode } : {}),
        title: 'Past call QA',
        description: '',
        message: 'Reminder QA',
        startsAt: '2020-01-01T17:00:00.000Z',
        durationMinutes: 60,
        meetingUrl: 'https://meet.google.com/qa-only',
        reminderMinutes: [5, 0],
        revision: 1,
        status: 'scheduled',
        syncState: 'synced',
        clickupId: mode === 'native' ? null : 'legacy-qa',
        discordMessageId: '123',
        discordChannelId: '456',
        participants: [
          {
            id: personId,
            name: 'Participant',
            userId: 'participant',
            clickupId: null,
            discordId: null,
          },
        ],
        createdAt: '2020-01-01T00:00:00.000Z',
        updatedAt: '2020-01-01T00:00:00.000Z',
      };
      await db`INSERT INTO managed_calls(id,body) VALUES(${id},${db.json(call)})`;
      await db`INSERT INTO managed_call_notifications(id,user_id,call_id,revision,body) VALUES(${`notice:${id}`},'participant',${id},1,${db.json({ callId: id })})`;
      if (mode === 'native')
        await db`INSERT INTO managed_native_deliveries(id,entity_kind,entity_id,revision,body,available_at,expires_at) VALUES(${`reminder:${id}:1:0`},'reminder',${id},1,${db.json({ call, minutes: 0 })},now(),now()+interval '2 minutes')`;
      else
        await db`INSERT INTO managed_call_reminders(id,call_id,revision,minutes,due_at) VALUES(${`reminder:${id}:1:0`},${id},1,0,now())`;
      return call;
    }
    function status(
      app: ReturnType<typeof Fastify>,
      id: string,
      action = 'complete',
      revision = 1,
      key = randomUUID(),
    ) {
      return app.inject({
        method: 'POST',
        url: `/calls/${id}/${action}`,
        headers: { 'idempotency-key': key },
        payload: { revision },
      });
    }

    it.each(['native', 'clickup', undefined] as const)(
      'completes a past %s call once without replaying reminders or requiring an external secret',
      async (mode) => {
        const manager = await appFor('manager');
        const participant = await appFor('participant');
        const call = await fixture(mode);
        expect((await manager.inject('/calls?status=scheduled')).json().calls[0].status).toBe(
          'scheduled',
        );
        expect((await participant.inject('/notifications')).json().notifications).toHaveLength(1);
        const key = randomUUID();
        const first = await status(manager, call.id, 'complete', 1, key);
        expect(first.statusCode).toBe(mode === 'native' ? 200 : 202);
        expect(first.json()).toMatchObject({
          id: call.id,
          revision: 2,
          status: 'completed',
          clickupId: call.clickupId,
        });
        expect((await status(manager, call.id, 'complete', 1, key)).json()).toEqual(first.json());
        expect((await manager.inject('/calls?status=scheduled')).json().calls).toEqual([]);
        expect((await manager.inject('/calls?status=completed')).json().calls).toHaveLength(1);
        expect((await participant.inject('/notifications')).json().notifications).toEqual([]);
        expect((await participant.inject('/calls/notifications')).json().notifications).toEqual([]);
        const [saved] = await db`SELECT body FROM managed_calls WHERE id=${call.id}`;
        expect(saved.body.managementMode).toBe(mode);
        if (mode === 'native') {
          expect(
            (await db`SELECT state FROM managed_native_deliveries WHERE entity_kind='reminder'`)[0]
              .state,
          ).toBe('expired');
          expect(await db`SELECT id FROM managed_native_requests`).toHaveLength(1);
          expect(
            await db`SELECT id FROM managed_native_deliveries WHERE entity_kind='call' AND state='queued'`,
          ).toHaveLength(1);
        } else {
          expect(first.json().syncState).toBe('queued');
          expect((await db`SELECT state FROM managed_call_reminders`)[0].state).toBe('superseded');
          expect(await db`SELECT id FROM managed_call_commands WHERE state='queued'`).toHaveLength(
            1,
          );
          expect(await db`SELECT id FROM managed_native_deliveries`).toEqual([]);
        }
      },
    );

    it.each(['native', 'clickup', undefined] as const)(
      'preserves company access, revision and idempotency checks for %s',
      async (mode) => {
        const manager = await appFor('manager');
        const participant = await appFor('participant');
        const other = await appFor('other');
        const call = await fixture(mode);
        for (const unauthorized of [participant, other])
          expect((await status(unauthorized, call.id)).statusCode).toBe(403);
        expect((await status(manager, call.id, 'complete', 2)).statusCode).toBe(409);
        const key = randomUUID();
        expect((await status(manager, call.id, 'cancel', 1, key)).statusCode).toBe(
          mode === 'native' ? 200 : 202,
        );
        expect((await status(manager, call.id, 'complete', 1, key)).statusCode).toBe(409);
        expect((await status(other, call.id, 'cancel', 1, key)).statusCode).toBe(403);
        expect(
          (await db`SELECT body FROM managed_calls WHERE id=${call.id}`)[0].body,
        ).toMatchObject({ status: 'cancelled', revision: 2 });
      },
    );

    it('still requires legacy automation for edits and for all legacy-mode management', async () => {
      const manager = await appFor('manager');
      const call = await fixture();
      const {
        id: _id,
        participants: _participants,
        status: _status,
        revision: _revision,
        createdAt: _created,
        updatedAt: _updated,
        syncState: _sync,
        clickupId: _cu,
        discordMessageId: _dm,
        discordChannelId: _dc,
        ...fields
      } = call;
      const edited = await manager.inject({
        method: 'PUT',
        url: `/calls/${call.id}`,
        headers: { 'idempotency-key': randomUUID() },
        payload: {
          ...fields,
          participantIds: [personId],
          startsAt: '2099-01-01T17:00:00.000Z',
          revision: 1,
        },
      });
      expect(edited.statusCode).toBe(503);
      env.TASK_MANAGEMENT_MODE = 'clickup';
      expect((await status(manager, call.id)).statusCode).toBe(503);
      expect((await db`SELECT body FROM managed_calls WHERE id=${call.id}`)[0].body.status).toBe(
        'scheduled',
      );
    });
  },
);
