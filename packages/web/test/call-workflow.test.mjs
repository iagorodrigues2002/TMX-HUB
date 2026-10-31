import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  buildCallWorkflow,
  confirmClickup,
  confirmDiscord,
  prepareCommand,
} from '../../../automations/call-worker.mjs';

const call = {
  id: 'local-call',
  revision: 1,
  title: 'Call QA',
  description: 'QA',
  message: 'Mensagem personalizada',
  startsAt: '2026-11-02T15:00:00.000Z',
  durationMinutes: 30,
  status: 'scheduled',
  meetingUrl: 'https://meet.google.com/example',
  participants: [{ clickupId: '100', discordId: '200' }],
  clickupId: null,
  discordMessageId: null,
};
const vars = {
  TMX_CALL_CONFIG_JSON: JSON.stringify({
    listId: '123',
    channelId: '456',
    statuses: { scheduled: 'agendada', completed: 'concluída', cancelled: 'cancelada' },
  }),
};
function prepare(action = 'sync') {
  return new Function('$vars', '$input', prepareCommand)(vars, {
    first: () => ({ json: { commands: [{ id: 'command-1', action, minutes: 5, call }] } }),
  })[0].json;
}
test('calls worker is inactive, credential references only, valid graph and code', () => {
  const w = buildCallWorkflow();
  assert.equal(w.active, false);
  const names = new Set(w.nodes.map((n) => n.name));
  assert.deepEqual(
    JSON.parse(
      readFileSync(new URL('../../../automations/n8n-call-worker.json', import.meta.url), 'utf8'),
    ),
    w,
  );
  for (const n of w.nodes) {
    if (n.type.endsWith('.code')) new Function('$vars', '$input', '$', n.parameters.jsCode);
    if (n.type.endsWith('.httpRequest')) assert.ok(n.credentials);
  }
  for (const [from, v] of Object.entries(w.connections)) {
    assert.ok(names.has(from));
    for (const a of v.main) for (const l of a) assert.ok(names.has(l.node));
  }
});
test('calls preparation respects timezone, participants, personalized message and stable nonce', () => {
  const p = prepare();
  assert.equal(p.clickupBody.due_date, Date.parse(call.startsAt));
  assert.match(p.discordBody.content, /12:00/);
  assert.match(p.discordBody.content, /Mensagem personalizada/);
  assert.deepEqual(p.discordBody.allowed_mentions, { parse: [], users: ['200'] });
  assert.equal(p.discordBody.enforce_nonce, true);
  assert.equal(p.discordBody.nonce, prepare().discordBody.nonce);
  assert.match(prepare('remind').discordBody.content, /5 minutos/);
  assert.throws(
    () =>
      new Function('$vars', '$input', prepareCommand)(
        { TMX_CALL_CONFIG_JSON: '{}' },
        { first: () => ({ json: { commands: [] } }) },
      ),
    /Configure/,
  );
});
test('provider receipts cannot confirm the wrong call, participants or Discord channel', () => {
  const p = prepare();
  const source = () => ({ item: { json: p } });
  const verify = new Function('$input', '$', confirmClickup);
  assert.throws(
    () =>
      verify(
        {
          item: {
            json: {
              id: 'abc',
              status: { status: 'agendada' },
              assignees: [],
              due_date: Date.parse(call.startsAt),
            },
          },
        },
        source,
      ),
    /não confirmou/,
  );
  const confirmed = verify(
    {
      item: {
        json: {
          id: 'abc',
          status: { status: 'agendada' },
          assignees: [{ id: 100 }],
          due_date: Date.parse(call.startsAt),
        },
      },
    },
    source,
  );
  assert.equal(confirmed.json.clickupId, 'abc');
  const discord = new Function('$input', '$', confirmDiscord);
  assert.throws(
    () => discord({ item: { json: { id: '777', channel_id: '999' } } }, source),
    /Discord/,
  );
});
test('distinct reminder times and revisions never share the Discord nonce', () => {
  const commands = [30, 5, 0].flatMap((minutes) =>
    [1, 2].map((revision) => ({
      id: `510334e8-567a-4bc1-b681-975512346789:${revision}:${minutes}`,
      action: 'remind',
      minutes,
      call: { ...call, revision },
    })),
  );
  const rows = new Function('$vars', '$input', prepareCommand)(vars, {
    first: () => ({ json: { commands } }),
  });
  assert.equal(new Set(rows.map((r) => r.json.discordBody.nonce)).size, 6);
  assert.ok(rows.every((r) => r.json.discordBody.nonce.length <= 25));
});

test('maximum call content fits Discord without dropping any participant mention', () => {
  const participants = Array.from({ length: 30 }, (_, i) => ({
    clickupId: String(100 + i),
    discordId: String(10000000000000000000n + BigInt(i)),
  }));
  const large = { ...call, title: 'T'.repeat(200), message: 'M'.repeat(1000), participants };
  for (const action of ['sync', 'remind']) {
    const [result] = new Function('$vars', '$input', prepareCommand)(vars, {
      first: () => ({ json: { commands: [{ id: 'max-message', action, minutes: 30, call: large }] } }),
    });
    assert.ok(result.json.discordBody.content.length <= 2000);
    assert.equal(result.json.discordBody.allowed_mentions.users.length, 30);
    for (const person of participants) {
      assert.ok(result.json.discordBody.content.includes(`<@${person.discordId}>`));
    }
    assert.ok(result.json.discordBody.content.includes(large.title));
  }
});
