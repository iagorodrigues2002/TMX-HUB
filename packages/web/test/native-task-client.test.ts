import assert from 'node:assert/strict';
import { test } from 'node:test';
import { demoTasks } from '../src/components/tasks/task-fixtures';
import {
  CenterNotificationSchema,
  notificationApi,
} from '../src/lib/api-client/endpoints-notifications';
import { taskApi } from '../src/lib/api-client/endpoints-tasks';

test('central accepts read persistent calls without a timed reminder', () => {
  const notice = {
    id: 'call:scheduled:qa:1',
    kind: 'call',
    unread: false,
    createdAt: '2026-11-01T18:00:00.000Z',
    title: 'QA call',
    call: {
      callId: 'qa',
      message: '',
      startsAt: '2026-11-02T17:00:00.000Z',
      meetingUrl: 'https://meet.google.com/abc-defg-hij',
      minutes: null,
    },
  };
  assert.equal(CenterNotificationSchema.parse(notice).unread, false);
  assert.equal(
    CenterNotificationSchema.safeParse({
      ...notice,
      call: { ...notice.call, meetingUrl: 'javascript:alert(1)' },
    }).success,
    false,
  );
});

test('native task clients send the revision for panel and notification actions', async () => {
  const previous = globalThis.fetch;
  const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
  globalThis.fetch = async (url, init) => {
    requests.push({ url: String(url), body: JSON.parse(String(init?.body ?? '{}')) });
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    await taskApi.status('native-id', 'done', 'key', 2);
    await notificationApi.status('native-id', 'progress', 'key-2', 3);
    assert.deepEqual(
      requests.map((r) => r.body),
      [
        { status: 'done', revision: 2 },
        { status: 'progress', revision: 3 },
      ],
    );
  } finally {
    globalThis.fetch = previous;
  }
});
test('native edit uses the same task identity and does not depend on a ClickUp ID', async () => {
  const previous = globalThis.fetch;
  const task = {
    ...demoTasks()[0]!,
    clickupId: null,
    managementMode: 'native' as const,
    revision: 2,
  };
  let request: { url: string; method: string; body: unknown } | undefined;
  globalThis.fetch = async (url, init) => {
    request = {
      url: String(url),
      method: String(init?.method),
      body: JSON.parse(String(init?.body)),
    };
    return new Response(JSON.stringify(task), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });
  };
  try {
    const fields = {
      title: 'Tarefa nativa editada',
      description: 'Nova descrição',
      priority: 'high' as const,
      dueAt: null,
      assigneeIds: task.assignees.map((p) => p.id),
      revision: 1,
    };
    const saved = await taskApi.edit(task.id, fields, 'edit-key');
    assert.equal(saved.id, task.id);
    assert.equal(saved.clickupId, null);
    assert.equal(request?.method, 'PUT');
    assert.ok(request?.url.endsWith(`/tasks/${task.id}`));
    assert.deepEqual(request?.body, fields);
  } finally {
    globalThis.fetch = previous;
  }
});
