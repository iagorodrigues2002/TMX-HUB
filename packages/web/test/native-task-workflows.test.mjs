import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildNativeTaskActions,
  buildNativeTaskCreate,
  buildNativeTaskWorker,
  confirmNativeDelivery,
  prepareNativeDeliveries,
  prepareNativeInteraction,
  prepareNativeTaskCreate,
} from '../../../automations/native-task-worker.mjs';

const task = {
  id: '11111111-1111-4111-8111-111111111111',
  managementMode: 'native',
  revision: 1,
  title: 'Tarefa QA',
  description: 'Texto @everyone',
  status: 'pending',
  sector: 'Spy',
  offer: null,
  priority: 'normal',
  dueAt: null,
  assignees: [{ id: 'person', name: 'QA', discordId: '123', userId: 'member', clickupId: null }],
};
const lease = {
  id: `task:${task.id}`,
  entityKind: 'task',
  revision: 1,
  leaseId: '22222222-2222-4222-8222-222222222222',
  channelId: '456',
  messageId: null,
  body: task,
};
const prepare = (l) =>
  new Function('$vars', '$input', prepareNativeDeliveries)(
    { TMX_TASK_WEB_BASE: 'https://tmx.example.test' },
    { first: () => ({ json: { deliveries: [l] } }) },
  )[0].json;

test('native workflow exports are inactive, authenticated and contain no ClickUp nodes', () => {
  for (const w of [buildNativeTaskWorker(), buildNativeTaskActions(), buildNativeTaskCreate()]) {
    assert.equal(w.active, false);
    const names = new Set(w.nodes.map((n) => n.name));
    assert.doesNotMatch(
      JSON.stringify(w),
      /clickup|api\.clickup\.com|xkeysib-|Bearer [a-zA-Z0-9]{20}/i,
    );
    for (const n of w.nodes) {
      if (n.type === 'n8n-nodes-base.httpRequest') assert.ok(n.credentials);
      if (n.type === 'n8n-nodes-base.code')
        new Function('$vars', '$input', '$', n.parameters.jsCode);
    }
    for (const [from, outputs] of Object.entries(w.connections)) {
      assert.ok(names.has(from));
      for (const links of outputs.main) for (const l of links) assert.ok(names.has(l.node));
    }
  }
  assert.equal(
    buildNativeTaskActions().nodes.some((n) => n.type === 'n8n-nodes-base.webhook'),
    false,
  );
});
test('exported drafts match builders and Discord creation resolves only linked TMX people', () => {
  for (const [file, build] of [
    ['worker', buildNativeTaskWorker],
    ['actions', buildNativeTaskActions],
    ['create', buildNativeTaskCreate],
  ]) {
    assert.deepEqual(
      JSON.parse(
        readFileSync(
          new URL(`../../../automations/n8n-native-task-${file}.json`, import.meta.url),
          'utf8',
        ),
      ),
      build(),
    );
  }
  const event = {
    message: { id: '789', author: { id: '123' } },
    task: { title: 'Nova tarefa', sector: 'Spy', assigneeDiscordIds: ['456'] },
  };
  const run = (people, e = event) =>
    new Function('$input', '$', prepareNativeTaskCreate)(
      { first: () => ({ json: { people } }) },
      () => ({ item: { json: e } }),
    );
  assert.equal(run([{ id: 'person', discordId: '456' }])[0].json.task.assigneeIds[0], 'person');
  assert.throws(() => run([]), /sem conta TMX/);
  assert.throws(
    () =>
      run([{ id: 'person', discordId: '456' }], {
        ...event,
        task: { ...event.task, assigneeDiscordIds: ['456', '456'] },
      }),
    /duplicado/,
  );
});
test('native publisher uses a stable nonce for new cards and updates the same message', () => {
  const first = prepare(lease);
  const retry = prepare({ ...lease, leaseId: '33333333-3333-4333-8333-333333333333' });
  assert.equal(first.discordBody.nonce, retry.discordBody.nonce);
  assert.equal(first.discordBody.enforce_nonce, true);
  assert.ok(first.discordBody.nonce.length <= 25);
  assert.deepEqual(first.discordBody.allowed_mentions.parse, []);
  const second = prepare({
    ...lease,
    messageId: '777',
    revision: 2,
    body: { ...task, revision: 2, status: 'progress' },
  });
  assert.equal(second.discordMethod, 'PATCH');
  assert.equal(second.discordUrl, 'https://discord.com/api/v10/channels/456/messages/777');
  assert.match(second.discordBody.components[0].components[0].custom_id, /tmx:native:.*:2:pending/);
});
test('delivery acknowledgement requires the real message, channel and native marker', () => {
  const input = prepare(lease);
  const run = (response) =>
    new Function('$input', '$', confirmNativeDelivery)({ item: { json: response } }, () => ({
      item: { json: input },
    })).json;
  const body = { id: '777', channel_id: '456', content: input.discordBody.content };
  assert.equal(run({ statusCode: 200, body }).outcome, 'confirmed');
  assert.equal(run({ statusCode: 200, body: { ...body, channel_id: '999' } }).outcome, 'uncertain');
  assert.equal(
    run({ statusCode: 200, body: { ...body, content: 'Outro card' } }).outcome,
    'uncertain',
  );
  assert.equal(run({ error: 'timeout' }).outcome, 'uncertain');
  assert.equal(run({ statusCode: 429, body: { retry_after: 2 } }).retryAfterMs, 2000);
  assert.equal(run({ statusCode: 401, body: {} }).outcome, 'permanent');
});
test('native action parser ignores old buttons and preserves the authenticated gateway actor', () => {
  const run = (payload) =>
    new Function('$input', prepareNativeInteraction)({ first: () => ({ json: payload }) });
  assert.deepEqual(run({ data: { custom_id: 'old:done' } }), []);
  const event = {
    id: '321',
    member: { user: { id: '123' } },
    channel_id: '456',
    message: { id: '777' },
    data: { custom_id: `tmx:native:${task.id}:2:done` },
  };
  const [result] = run(event);
  assert.equal(result.json.actorDiscordId, '123');
  assert.equal(result.json.revision, 2);
  assert.equal(result.json.taskId, task.id);
  assert.throws(() => run({ ...event, member: null, user: null }), /identidade/i);
});
