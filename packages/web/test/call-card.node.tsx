import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ManagedCallSchema } from '@page-cloner/shared';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CallCard } from '../src/components/tasks/call-card';
import { callApi } from '../src/lib/api-client/endpoints-calls';

const call = ManagedCallSchema.parse({
  id: '388059b5-7dcf-4c9a-81f6-7baf72357c87',
  title: 'Call QA',
  startsAt: '2026-11-02T17:00:00.000Z',
  durationMinutes: 60,
  meetingUrl: 'https://example.test/meeting',
  participants: [],
  revision: 1,
  status: 'scheduled',
  clickupId: null,
  discordMessageId: null,
  discordChannelId: null,
  syncState: 'synced',
  createdAt: '2026-11-01T17:00:00.000Z',
  updatedAt: '2026-11-01T17:00:00.000Z',
});
const props = {
  now: Date.parse('2026-11-03T12:00:00Z'),
  busy: false,
  onEdit: () => {},
  onStatus: () => {},
};

test('past scheduled calls expose completion, reschedule and cancellation without expanding details', () => {
  const html = renderToStaticMarkup(<CallCard {...props} call={call} />);
  const visible = html.split('<details')[0];
  assert.match(visible, /Aguardando conclusão/);
  assert.match(visible, /Horário encerrado/);
  for (const label of ['Marcar como concluída', 'Editar / reagendar', 'Cancelar call'])
    assert.ok(visible.includes(label));
  assert.doesNotMatch(html, /<details[^>]*\bopen\b/);
  assert.match(visible, /02\/11\/2026, 14:00/);
});

test('completed and cancelled calls keep history without exposing invalid scheduled actions', () => {
  for (const [status, label] of [
    ['completed', 'Concluída'],
    ['cancelled', 'Cancelada'],
  ] as const) {
    const html = renderToStaticMarkup(<CallCard {...props} call={{ ...call, status }} />);
    assert.ok(html.includes(label));
    assert.doesNotMatch(
      html,
      /Marcar como concluída|Editar \/ reagendar|Cancelar call|Aguardando conclusão/,
    );
  }
});

test('pending legacy synchronization is not reported as confirmed after local completion', () => {
  const html = renderToStaticMarkup(
    <CallCard {...props} call={{ ...call, status: 'completed', syncState: 'queued' }} />,
  );
  assert.match(html, /Concluída/);
  assert.match(html, /Integração antiga pendente/);
  assert.doesNotMatch(html, /ClickUp e Discord confirmados/);
});

test('in-flight mutations disable all status and edit buttons', () => {
  const html = renderToStaticMarkup(<CallCard {...props} call={call} busy />);
  const buttons = html.match(/<button\b[^>]*>/g) ?? [];
  assert.equal(buttons.length, 3);
  assert.ok(buttons.every((button) => button.includes('disabled')));
});

test('status changes validate the saved call and preserve revision and idempotency', async (t) => {
  let body: unknown;
  let headers: Headers;
  let method: unknown;
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.ok(String(url).endsWith(`/v1/calls/${call.id}/complete`));
    method = options?.method;
    body = JSON.parse(String(options?.body));
    headers = new Headers(options?.headers);
    return Response.json({ ...call, status: 'completed', revision: 2 });
  });
  const saved = await callApi.status(call.id, 1, 'complete', 'local-idempotent-key');
  assert.equal(saved.status, 'completed');
  assert.equal(method, 'POST');
  assert.deepEqual(body, { revision: 1 });
  assert.equal(headers!.get('Idempotency-Key'), 'local-idempotent-key');
  t.mock.method(globalThis, 'fetch', async () => Response.json({ ok: true }));
  await assert.rejects(callApi.status(call.id, 1, 'complete', 'local-idempotent-key'));
});
