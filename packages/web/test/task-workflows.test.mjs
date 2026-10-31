import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const workflow = (name) =>
  JSON.parse(readFileSync(new URL(`../../../automations/${name}.json`, import.meta.url), 'utf8'));
test('the TMX worker never publishes Discord cards in parallel with the canonical publisher', () => {
  for (const name of ['n8n-task-dashboard-worker', 'n8n-task-mirror']) {
    assert.equal(
      workflow(name).nodes.some((node) => node.parameters.nodeCredentialType === 'discordBotApi'),
      false,
    );
  }
});
for (const name of ['n8n-task-dashboard-worker', 'n8n-task-mirror', 'n8n-task-single-publisher']) {
  test(`${name}: inactive, valid node graph and no credentials or HTTP calls in Code nodes`, () => {
    const w = workflow(name);
    const names = new Set(w.nodes.map((n) => n.name));
    assert.equal(w.active, false);
    for (const n of w.nodes) {
      if (n.type === 'n8n-nodes-base.code') {
        new Function('$vars', '$input', '$', n.parameters.jsCode);
        assert.doesNotMatch(n.parameters.jsCode, /fetch\(|httpRequest\(|getCredentials\(/);
      }
      if (n.type === 'n8n-nodes-base.httpRequest') assert.ok(n.credentials);
    }
    for (const [from, outputs] of Object.entries(w.connections)) {
      assert.ok(names.has(from));
      for (const links of outputs.main) for (const link of links) assert.ok(names.has(link.node));
    }
    assert.doesNotMatch(JSON.stringify(w), /pk_[a-zA-Z0-9]{10,}|xkeysib-|Bearer [a-zA-Z0-9]{20,}/);
  });
}

test('single publisher updates the same message, retains both people and retries callbacks safely', () => {
  const w = workflow('n8n-task-single-publisher');
  const node = (name) => w.nodes.find((n) => n.name === name);
  assert.equal(node('Excluir mensagem antiga'), undefined);
  assert.equal(node('Publicar estado atualizado com botões').parameters.method, 'PATCH');
  assert.match(
    node('Publicar primeiro estado com botões').parameters.jsonBody,
    /enforce_nonce: true/,
  );
  const task = {
    id: 'abc',
    name: 'QA task',
    list: { name: 'Spy' },
    date_updated: '1793290000000',
    status: { status: 'em progresso' },
    assignees: [{ id: '101375637' }, { id: '101399101' }],
  };
  const cache = { abc: { messageId: '777', channelId: '456' } };
  const prepare = new Function(
    '$json',
    '$getWorkflowStaticData',
    node('Preparar estado atual').parameters.jsCode,
  );
  for (let i = 0; i < 2; i++) {
    const result = prepare(task, () => cache).json;
    assert.equal(result.previousMessageId, '777');
    assert.match(result.content, /<@343585375618334732>/);
    assert.match(result.content, /<@1357487279454556281>/);
    assert.equal(result.channelId, '1557087913542549526');
  }
  assert.equal(
    prepare(
      {
        ...task,
        description:
          'TMX call 11111111-1111-4111-8111-111111111111 revision 1\nhttps://meet.google.com/test',
      },
      () => cache,
    ),
    null,
  );
  assert.equal(
    prepare({ ...task, list: { name: 'Tráfego' } }, () => cache).json.channelId,
    '1566131429467754656',
  );
  assert.equal(
    prepare({ ...task, list: { name: 'Funil & Desenvolvimento' } }, () => cache).json.channelId,
    '1566131429551644722',
  );
  const save = new Function(
    '$input',
    '$',
    '$getWorkflowStaticData',
    node('Guardar ID atualizado').parameters.jsCode,
  );
  assert.throws(
    () =>
      save(
        { item: { json: { id: '777', channel_id: '999' } } },
        () => ({ item: { json: { ...task, previousChannelId: '456' } } }),
        () => cache,
      ),
    /não confirmou/,
  );
});

test('worker prepares every command and confirms provider status before mirroring', () => {
  const w = workflow('n8n-task-dashboard-worker');
  const config = {
    Spy: {
      listId: '123',
      channelId: '456',
      statuses: { pending: 'to do', progress: 'in progress', done: 'complete' },
    },
  };
  const task = {
    id: 'local-id',
    title: 'QA task',
    sector: 'Spy',
    offer: null,
    description: '',
    assignees: [{ clickupId: '100', discordId: '200', name: 'QA' }],
    priority: 'normal',
    dueAt: null,
    startedAt: null,
    assignedAt: null,
  };
  const commands = [1, 2].map((id) => ({ id: String(id), action: 'create', task }));
  const code = w.nodes.find((n) => n.name === 'Preparar comandos').parameters.jsCode;
  const output = new Function('$vars', '$input', 'URL', code)(
    { TMX_TASK_CONFIG_JSON: JSON.stringify(config), TMX_TASK_API_BASE: 'https://example.test' },
    { first: () => ({ json: { commands } }) },
  );
  assert.equal(output.length, 2);
  assert.deepEqual(output[0].json.body.assignees, [100]);
  assert.match(output[0].json.body.markdown_description, /TMX request 1/);
  const checkpoint = w.nodes.find((n) => n.name === 'Preparar espelho ClickUp');
  assert.equal(checkpoint.parameters.mode, 'runOnceForEachItem');
  const run = new Function('$input', '$', checkpoint.parameters.jsCode);
  const source = () => ({ item: { json: output[0].json } });
  assert.throws(
    () => run({ item: { json: { id: 'abc', status: { status: 'wrong' } } } }, source),
    /não confirmou o status/,
  );
  const result = run(
    {
      item: {
        json: {
          id: 'abc',
          date_updated: '1793290000000',
          status: { status: 'to do' },
          assignees: [{ id: '100' }],
        },
      },
    },
    source,
  );
  assert.equal(result.json.event.task.clickupId, 'abc');
  assert.equal(result.json.event.task.discordState, 'pending');
  assert.equal(result.json.discordBody, undefined);
  assert.throws(
    () =>
      run(
        {
          item: {
            json: {
              id: 'wrong-task',
              date_updated: '1793290000000',
              status: { status: 'to do' },
              assignees: [{ id: '100' }],
            },
          },
        },
        () => ({
          item: {
            json: {
              ...output[0].json,
              command: {
                ...commands[0],
                action: 'status',
                task: { ...task, clickupId: 'expected-task' },
              },
            },
          },
        }),
      ),
    /identidade/,
  );
});

test('mirror requires a confirmed Discord receipt and preserves responsible people', () => {
  const code = workflow('n8n-task-mirror').nodes.find((n) => n.name === 'Normalizar tarefa')
    .parameters.jsCode;
  const people = [{ id: 'local-1', clickupId: '100', discordId: '200', name: 'QA' }];
  const envelope = {
    eventId: 'real-shape:1',
    source: 'discord',
    discordMessageId: '777',
    discordChannelId: '456',
    task: {
      id: 'abc',
      name: 'QA task',
      list: { id: '123' },
      status: { status: 'to do' },
      date_updated: '1793290000000',
      assignees: [{ id: '100' }],
      description: 'Oferta: PJR_ENG\nSetor: Spy',
    },
  };
  const result = new Function('$vars', '$input', '$', code)(
    {
      TMX_TASK_CONFIG_JSON: JSON.stringify({
        Spy: { listId: '123', channelId: '456', statuses: { pending: 'to do' } },
      }),
    },
    { first: () => ({ json: { task: null } }) },
    (name) =>
      name === 'Receber tarefa confirmada'
        ? { item: { json: { body: envelope } } }
        : { first: () => ({ json: { people } }) },
  );
  assert.equal(result[0].json.task.offer, 'PJR_ENG');
  assert.deepEqual(result[0].json.task.assignees, people);
  assert.equal(result[0].json.task.discordState, 'synced');
  assert.equal(result[0].json.task.discordMessageId, '777');
  assert.equal(result[0].json.discordBody, undefined);
  envelope.discordMessageId = undefined;
  assert.throws(
    () =>
      new Function('$vars', '$input', '$', code)(
        {
          TMX_TASK_CONFIG_JSON: JSON.stringify({
            Spy: { listId: '123', channelId: '456', statuses: { pending: 'to do' } },
          }),
        },
        { first: () => ({ json: { task: null } }) },
        (name) =>
          name === 'Receber tarefa confirmada'
            ? { item: { json: { body: envelope } } }
            : { first: () => ({ json: { people } }) },
      ),
    /Recibo Discord confirmado obrigatório/,
  );
});

test('mirror refuses unmapped assignees rather than silently omitting a responsible person', () => {
  const w = workflow('n8n-task-mirror');
  const code = w.nodes.find((n) => n.name === 'Normalizar tarefa').parameters.jsCode;
  const envelope = {
    eventId: 'external:1',
    source: 'discord',
    task: {
      id: 'abc',
      list: { id: '123' },
      status: { status: 'to do' },
      date_updated: '1793290000000',
      assignees: [{ id: 'missing' }],
    },
  };
  const lookup = (name) =>
    name === 'Receber tarefa confirmada'
      ? { item: { json: { body: envelope } } }
      : { first: () => ({ json: { people: [] } }) };
  assert.throws(
    () =>
      new Function('$vars', '$input', '$', code)(
        {
          TMX_TASK_CONFIG_JSON: JSON.stringify({
            Spy: { listId: '123', channelId: '456', statuses: { pending: 'to do' } },
          }),
        },
        { first: () => ({ json: { task: null } }) },
        lookup,
      ),
    /Responsável sem vínculo/,
  );
});
