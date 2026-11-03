import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import {
  buildArtifacts,
  intakeHint,
  normalizeVerifiedMessage,
  validateSignedInteraction,
} from './native-cutover.mjs';

const now = Date.parse('2026-11-03T12:00:00Z');
const config = {
  apiBase: 'https://tmx.example.invalid',
  webBase: 'https://tmx.example.invalid',
  companyId: '11111111-1111-4111-8111-111111111111',
  intakeChannelId: '111111111111111111',
  notBefore: '2026-11-03T00:00:00.000Z',
  aliases: { dods: '333333333333333333', iago: '222222222222222222' },
  tmxCredential: { id: 'synthetic-tmx', name: 'Synthetic TMX' },
  discordCredential: { id: 'synthetic-bot', name: 'Synthetic Bot' },
};
const hint = { messageId: '444444444444444444', channelId: config.intakeChannelId };
const people = [
  {
    id: '22222222-2222-4222-8222-222222222222',
    userId: 'user-a',
    name: 'Iago Rodrigues',
    discordId: '222222222222222222',
  },
  {
    id: '33333333-3333-4333-8333-333333333333',
    userId: 'user-b',
    name: 'Douglas Riti',
    discordId: '333333333333333333',
  },
];
const message = {
  id: hint.messageId,
  channel_id: hint.channelId,
  author: { id: '222222222222222222', bot: false },
  timestamp: new Date(now).toISOString(),
  content:
    'Tarefa: Testar nativo\nSetor: Spy\nResponsável: Dods e Iago\nOferta: Sem oferta\nPrazo: 05/11/2026\nPrioridade: Alta\nDescrição: Teste local.',
};
const normalize = (changes = {}, persons = people, cfg = config) =>
  normalizeVerifiedMessage({ ...message, ...changes }, hint, persons, cfg, now);

test('intake accepts only IDs of fixed allowed channel, discards forged author/content/company', () => {
  assert.deepEqual(
    intakeHint(
      {
        body: {
          d: {
            id: hint.messageId,
            channel_id: hint.channelId,
            author: { id: 'forged' },
            content: 'forged',
            companyId: 'forged',
          },
        },
      },
      config.intakeChannelId,
    ),
    hint,
  );
});
test('intake rejects another channel', () =>
  assert.equal(
    intakeHint({ id: hint.messageId, channel_id: '999999999999999999' }, config.intakeChannelId),
    null,
  ));
test('intake rejects URL injection in message id', () =>
  assert.equal(
    intakeHint({ id: '../messages?x=1', channel_id: hint.channelId }, config.intakeChannelId),
    null,
  ));
test('normalizer uses actual fetched author and configured company; maps Dods and explicit names', () => {
  const result = normalize();
  assert.equal(result.actorDiscordId, message.author.id);
  assert.equal(result.task.companyId, config.companyId);
  assert.deepEqual(result.task.assigneeIds, [people[1].id, people[0].id]);
  assert.equal(result.task.priority, 'high');
  assert.equal(result.task.dueAt, '2026-11-06T02:59:59.000Z');
  assert.equal(result.task.offer, null);
});
test('message lookup mismatch fails', () =>
  assert.throws(() => normalize({ id: '555555555555555555' }), /discord_message_mismatch/));
test('message from another channel fails', () =>
  assert.throws(() => normalize({ channel_id: '555555555555555555' }), /discord_message_mismatch/));
test('bot message rejected', () =>
  assert.throws(
    () => normalize({ author: { ...message.author, bot: true } }),
    /discord_actor_invalid/,
  ));
test('webhook-authored message rejected', () =>
  assert.throws(() => normalize({ webhook_id: '555555555555555555' }), /discord_actor_invalid/));
test('historical message cannot be imported by replay', () =>
  assert.throws(
    () => normalize({ timestamp: new Date(now - 901000).toISOString() }),
    /not_recent/,
  ));
test('message invalid timestamp fails', () =>
  assert.throws(() => normalize({ timestamp: 'bad' }), /not_recent/));
test('recent messages from before cutover are not imported from legacy', () =>
  assert.throws(
    () =>
      normalize({ timestamp: new Date(now - 30_000).toISOString() }, people, {
        ...config,
        notBefore: new Date(now - 10_000).toISOString(),
      }),
    /before_native_cutover/,
  ));
test('missing assignee refuses silent omission', () =>
  assert.throws(() => normalize({ content: 'Tarefa: Testar\nSetor: Spy' }), /assignees_required/));
test('unknown assignee refuses silent omission', () =>
  assert.throws(
    () => normalize({ content: 'Tarefa: Testar\nSetor: Spy\nResponsável: Dods e Unknown' }),
    /not_uniquely_linked/,
  ));
test('unlinked TMX user rejected', () =>
  assert.throws(
    () =>
      normalize(
        {},
        people.map((p) => ({ ...p, userId: null })),
      ),
    /not_uniquely_linked/,
  ));
test('ambiguous linked Discord ID rejected', () =>
  assert.throws(
    () => normalize({}, [...people, { ...people[1], id: crypto.randomUUID() }]),
    /not_uniquely_linked/,
  ));
test('duplicate assignment alias rejected', () =>
  assert.throws(
    () => normalize({ content: 'Tarefa: Testar\nSetor: Spy\nResponsável: Dods, Douglas Riti' }),
    /duplicate_task_assignee/,
  ));
test('invalid calendar date rejected', () =>
  assert.throws(
    () => normalize({ content: message.content.replace('05/11/2026', '31/02/2026') }),
    /deadline_invalid/,
  ));
test('valid leap day accepted', () =>
  assert.equal(
    normalize({ content: message.content.replace('05/11/2026', '29/02/2028') }).task.dueAt,
    '2028-03-01T02:59:59.000Z',
  ));
test('duplicate form field rejected', () =>
  assert.throws(
    () => normalize({ content: `${message.content}\nSetor: Tráfego` }),
    /duplicate_task_field/,
  ));
test('safe mention assignee accepted', () =>
  assert.deepEqual(
    normalize({ content: message.content.replace('Dods e Iago', '<@333333333333333333>') }).task
      .assigneeIds,
    [people[1].id],
  ));
test('input company never overrides configured company', () =>
  assert.equal(
    normalize({ companyId: '99999999-9999-4999-8999-999999999999' }).task.companyId,
    config.companyId,
  ));

const pair = crypto.generateKeyPairSync('ed25519');
const publicHex = pair.publicKey
  .export({ format: 'der', type: 'spki' })
  .subarray(-32)
  .toString('hex');
const interaction = {
  type: 3,
  id: '888888888888888888',
  application_id: '999999999999999999',
  token: 'synthetic_interaction_token_only',
  channel_id: hint.channelId,
  member: { user: { id: people[0].discordId } },
  message: { id: '777777777777777777' },
  data: { custom_id: 'tmx:native:11111111-1111-4111-8111-111111111111:3:done' },
};
function signed(
  event = interaction,
  timestamp = String(now / 1000),
  raw = Buffer.from(JSON.stringify(event, null, 2)),
) {
  const signature = crypto
    .sign(null, Buffer.concat([Buffer.from(timestamp), raw]), pair.privateKey)
    .toString('hex');
  return { raw, headers: { 'x-signature-ed25519': signature, 'x-signature-timestamp': timestamp } };
}
const verify = (value, raw = value.raw) =>
  validateSignedInteraction(value.headers, raw, publicHex, now);
test('valid native signature preserves exact raw whitespace and produces ACK before update', async () => {
  const result = await verify(signed());
  assert.equal(result.responseCode, 200);
  assert.deepEqual(result.responseBody, { type: 6 });
  assert.equal(result.apiBody.revision, 3);
  assert.equal(result.apiBody.status, 'done');
  assert.equal(result.apiBody.actorDiscordId, people[0].discordId);
});
test('reserializing JSON breaks signature and must fail', async () =>
  assert.equal(
    (await verify(signed(), Buffer.from(JSON.stringify(interaction)))).responseCode,
    401,
  ));
test('tampering actor fails signature', async () =>
  assert.equal(
    (
      await verify(
        signed(),
        Buffer.from(JSON.stringify({ ...interaction, user: { id: 'forged' } })),
      )
    ).responseCode,
    401,
  ));
test('missing raw binary is fail-closed', async () =>
  assert.equal((await verify(signed(), null)).responseCode, 401));
test('old signature rejected', async () =>
  assert.equal((await verify(signed(interaction, String(now / 1000 - 301)))).responseCode, 401));
test('future signature rejected', async () =>
  assert.equal((await verify(signed(interaction, String(now / 1000 + 61)))).responseCode, 401));
test('signed ping passes', async () =>
  assert.deepEqual((await verify(signed({ type: 1 }))).responseBody, { type: 1 }));
test('signed legacy button gives private no-write explanation', async () => {
  const result = await verify(
    signed({ ...interaction, data: { custom_id: 'tmx_status|oldtask|done' } }),
  );
  assert.equal(result.needsUpdate, false);
  assert.equal(result.responseBody.data.flags, 64);
});
test('invalid native revision rejected', async () =>
  assert.equal(
    (
      await verify(
        signed({
          ...interaction,
          data: {
            custom_id: 'tmx:native:11111111-1111-4111-8111-111111111111:9007199254740992:done',
          },
        }),
      )
    ).responseCode,
    400,
  ));
test('signed payload without actual actor rejected', async () =>
  assert.equal((await verify(signed({ ...interaction, member: {} }))).responseCode, 400));

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const templates = Object.fromEntries(
  ['worker', 'create', 'actions'].map((kind) => [
    kind,
    JSON.parse(fs.readFileSync(`${repo}/automations/n8n-native-task-${kind}.json`)),
  ]),
);
const intake = {
  id: 'synthetic-existing-intake',
  name: 'synthetic',
  active: true,
  staticData: { processed: { old: true } },
  nodes: [
    {
      id: 'hook',
      name: 'Receive',
      type: 'n8n-nodes-base.webhook',
      parameters: { path: 'preserved-intake-path', responseMode: 'responseNode' },
    },
  ],
};
const interactions = {
  id: 'synthetic-existing-actions',
  name: 'synthetic',
  active: true,
  nodes: [
    {
      id: 'hook',
      name: 'Receive',
      type: 'n8n-nodes-base.webhook',
      parameters: { path: 'preserved-interactions-path', responseMode: 'onReceived' },
    },
    {
      name: 'Validar assinatura e interpretar',
      type: 'n8n-nodes-base.code',
      parameters: { jsCode: `const publicKeyHex = '${publicHex}';` },
    },
    {
      name: 'Responder Discord em até 3s',
      type: 'n8n-nodes-base.respondToWebhook',
      parameters: {},
    },
  ],
};
const artifacts = buildArtifacts(config, templates, intake, interactions);
const workerCode = artifacts.worker.nodes.find((node) => node.name === 'Preparar entregas nativas')
  .parameters.jsCode;
const taskLease = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  leaseId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  entityKind: 'task',
  channelId: '111111111111111111',
  revision: 1,
  body: {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    managementMode: 'native',
    revision: 1,
    title: 'Teste sintético',
    status: 'pending',
    sector: 'Spy',
    assignees: people,
  },
};
const runWorker = (deliveries, code = workerCode, vars = {}) =>
  vm.runInNewContext(`(function(){${code}\n})()`, {
    URL: undefined,
    URLSearchParams: undefined,
    $vars: vars,
    $input: { first: () => ({ json: { deliveries } }) },
  });
test('native worker builds task cards in n8n Code VM without URL globals', () => {
  const output = runWorker([taskLease]);
  assert.equal(output.length, 1);
  assert.equal(output[0].json.discordMethod, 'POST');
  assert.match(output[0].json.discordBody.content, /Teste sintético/);
  assert.equal(output[0].json.discordBody.enforce_nonce, true);
});
const callLease = {
  ...taskLease,
  entityKind: 'call',
  body: {
    ...taskLease.body,
    status: 'scheduled',
    participants: people,
    meetingUrl: 'https://meet.example.invalid/abc-defg-hij?source=tmx',
    startsAt: '2026-11-03T17:00:00.000Z',
    durationMinutes: 30,
  },
};
test('native worker builds call and reminder cards without URL globals or require', () => {
  const reminder = {
    ...callLease,
    entityKind: 'reminder',
    body: { minutes: 15, call: callLease.body },
  };
  const result = runWorker([callLease, reminder]);
  assert.equal(result.length, 2);
  assert.equal(
    result[0].json.discordBody.components[0].components[0].url,
    callLease.body.meetingUrl,
  );
  assert.match(result[0].json.discordBody.content, /Call agendada/);
  assert.match(result[1].json.discordBody.content, /Call em 15 minutos/);
});
test('empty native delivery claim is valid in restricted Code VM', () => {
  assert.equal(runWorker([]).length, 0);
});
for (const meetingUrl of [
  'http://meet.example.invalid/call',
  'javascript:alert(1)',
  'https://trusted.example@attacker.example/call',
  'https://user:password@meet.example.invalid/call',
  'https://meet.example.invalid\\@attacker.example/call',
  'https://meet.example.invalid\n/call',
  'https://meet.example.invalid:70000/call',
  'https://meet.example.invalid:0/call',
  'https://meet..example.invalid/call',
  'https://-meet.example.invalid/call',
  'https://%6deet.example.invalid/call',
])
  test(`native worker rejects unsafe meeting link ${JSON.stringify(meetingUrl)}`, () => {
    assert.throws(
      () => runWorker([{ ...callLease, body: { ...callLease.body, meetingUrl } }]),
      /Link de call inválido/,
    );
  });
test('unbound worker keeps localhost-only HTTP allowance for preview', () => {
  const code = templates.worker.nodes.find((node) => node.name === 'Preparar entregas nativas')
    .parameters.jsCode;
  assert.equal(runWorker([], code, { TMX_TASK_WEB_BASE: 'http://localhost:3100' }).length, 0);
  assert.equal(runWorker([], code, { TMX_TASK_WEB_BASE: 'http://127.0.0.1:3122' }).length, 0);
  for (const base of ['http://remote.example.invalid', 'https://user@remote.example.invalid'])
    assert.throws(() => runWorker([], code, { TMX_TASK_WEB_BASE: base }), /URL pública segura/);
});
test('response mode is explicit even when original templates use opposite modes', () => {
  assert.equal(artifacts.intake.nodes[0].parameters.responseMode, 'onReceived');
  assert.equal(artifacts.interactions.nodes[0].parameters.responseMode, 'responseNode');
});
test('all artifacts inactive and no secret/public endpoint rebinding', () => {
  assert.equal(Object.keys(artifacts).length, 5);
  assert.ok(Object.values(artifacts).every((w) => w.active === false));
  assert.equal(artifacts.intake.nodes[0].parameters.path, 'preserved-intake-path');
  assert.equal(artifacts.interactions.nodes[0].parameters.path, 'preserved-interactions-path');
  assert.equal(artifacts.intake.staticData, undefined);
});
test('generator requires explicit cutover timestamp', () =>
  assert.throws(
    () => buildArtifacts({ ...config, notBefore: null }, templates, intake, interactions),
    /cutover_timestamp_required/,
  ));
test('artifacts remove all ClickUp nodes and credentials', () =>
  assert.doesNotMatch(JSON.stringify(artifacts), /clickUpApi|n8n-nodes-base\.clickUp/));
test('artifacts use exact supplied server-only credentials and no vars/placeholders', () => {
  const text = JSON.stringify(artifacts);
  assert.doesNotMatch(text, /CONFIGURE_NATIVE|\$vars\.TMX_TASK/);
  for (const w of Object.values(artifacts))
    for (const node of w.nodes)
      if (node.credentials?.httpHeaderAuth)
        assert.deepEqual(node.credentials.httpHeaderAuth, config.tmxCredential);
});
test('intake authenticates message before parsing and posting TMX', () => {
  assert.deepEqual(artifacts.intake.nodes.map((n) => n.name).slice(1, 6), [
    'Validar chave de consulta',
    'Consultar mensagem real no Discord',
    'Consultar pessoas vinculadas no TMX',
    'Preparar tarefa da mensagem verificada',
    'Criar tarefa nativa idempotente',
  ]);
  const msg = artifacts.intake.nodes[2];
  assert.equal(msg.parameters.method, 'GET');
  assert.deepEqual(msg.credentials.discordBotApi, config.discordCredential);
});
test('interactions verify binary and ACK before any write', () => {
  const nodes = artifacts.interactions.nodes;
  assert.match(nodes[1].parameters.jsCode, /getBinaryDataBuffer\(0,'data'\)/);
  assert.equal(nodes[2].type, 'n8n-nodes-base.respondToWebhook');
  assert.equal(nodes[4].parameters.url, `${config.apiBase}/v1/native-task-automation/interaction`);
  assert.equal(nodes[2].parameters.responseBody, '={{ $json.responseBody }}');
});
test('only native worker publishes public task cards', () => {
  const directMessages = Object.entries(artifacts).flatMap(([kind, w]) =>
    w.nodes
      .filter(
        (n) =>
          n.parameters?.method === 'POST' &&
          /discord\.com\/api\/v10\/channels/.test(n.parameters?.url || ''),
      )
      .map((n) => `${kind}:${n.name}`),
  );
  assert.deepEqual(directMessages, []); // Worker target is validated dynamically from the lease; intake only PUTs one reaction.
  assert.equal(
    artifacts.worker.nodes.find((n) => n.name === 'Publicar estado nativo').retryOnFail,
    false,
  );
});
test('all generated code nodes parse', () => {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  for (const w of Object.values(artifacts))
    for (const n of w.nodes)
      if (n.type === 'n8n-nodes-base.code')
        assert.doesNotThrow(() => new AsyncFunction(n.parameters.jsCode));
});
test('all graph targets exist and no dangling publisher branches', () => {
  for (const w of Object.values(artifacts)) {
    const names = new Set(w.nodes.map((n) => n.name));
    for (const [from, edges] of Object.entries(w.connections)) {
      assert.ok(names.has(from));
      for (const branch of edges.main) for (const edge of branch) assert.ok(names.has(edge.node));
    }
  }
});
test('actual generated intake code uses canonical data instead of original payload', async () => {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const node = artifacts.intake.nodes.find(
    (n) => n.name === 'Preparar tarefa da mensagem verificada',
  );
  const fresh = { ...message, timestamp: new Date().toISOString() };
  const lookup = (name) => ({
    first: () => ({ json: name === 'Validar chave de consulta' ? hint : fresh }),
  });
  const result = await new AsyncFunction('$', '$input', node.parameters.jsCode)(lookup, {
    first: () => ({ json: { people } }),
  });
  assert.equal(result[0].json.actorDiscordId, fresh.author.id);
  assert.equal(result[0].json.task.companyId, config.companyId);
});
test('actual generated signed code reads helper raw binary and rejects missing binary', async () => {
  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor;
  const node = artifacts.interactions.nodes[1];
  const run = new AsyncFunction('require', '$input', node.parameters.jsCode);
  const value = signed(interaction, String(Math.floor(Date.now() / 1000)));
  const input = { first: () => ({ json: { headers: value.headers, body: { forged: true } } }) };
  const result = await run.call(
    { helpers: { getBinaryDataBuffer: async () => value.raw } },
    () => crypto,
    input,
  );
  assert.equal(result[0].json.needsUpdate, true);
  const rejected = await run.call(
    {
      helpers: {
        getBinaryDataBuffer: async () => {
          throw new Error('missing');
        },
      },
    },
    () => crypto,
    input,
  );
  assert.equal(rejected[0].json.responseCode, 401);
});
