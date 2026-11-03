import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CenterNotificationSchema,
  centerSaleAmount,
  notificationApi,
} from '../src/lib/api-client/endpoints-notifications';

test('real center money formatting never guesses currency or formats unsafe amounts', () => {
  assert.match(centerSaleAmount('12417', 'BRL'), /124,17/);
  for (const [amount, currency] of [
    [null, 'BRL'],
    ['12417', null],
    ['bad', 'USD'],
    ['9007199254740992', 'BRL'],
  ] as const)
    assert.equal(centerSaleAmount(amount, currency), 'Valor indisponível');
});

test('center rejects unknown movements and unsafe call links at the network boundary', () => {
  const common = {
    id: 'call:1',
    unread: true,
    createdAt: '2026-11-02T13:30:00.000Z',
    title: 'Call',
  };
  assert.equal(CenterNotificationSchema.safeParse({ ...common, kind: 'movement' }).success, false);
  assert.equal(
    CenterNotificationSchema.safeParse({
      ...common,
      kind: 'call',
      call: {
        callId: '1',
        startsAt: common.createdAt,
        message: '',
        minutes: 5,
        meetingUrl: 'javascript:alert(1)',
      },
    }).success,
    false,
  );
});

test('financial notices validate separate amounts and never become sale events', () => {
  const notice = {
    id: 'finance:1',
    kind: 'finance',
    unread: true,
    title: 'Entrada financeira registrada',
    createdAt: '2026-11-03T15:00:00.000Z',
    finance: {
      companyId: '53ffdf70-ff87-4ca1-a9a5-a341fb75899c',
      companyName: 'QA',
      provider: 'wise',
      direction: 'incoming',
      amount: '125.10',
      currency: 'USD',
      category: 'income',
      occurredAt: '2026-11-03T14:59:00.000Z',
    },
  };
  assert.equal(CenterNotificationSchema.safeParse(notice).success, true);
  assert.equal(
    CenterNotificationSchema.safeParse({ ...notice, finance: { ...notice.finance, amount: 'NaN' } })
      .success,
    false,
  );
});

test('marking all notifications respects the 500-item API limit', async () => {
  const original = globalThis.fetch;
  const sizes: number[] = [];
  globalThis.fetch = async (_url, init) => {
    sizes.push(JSON.parse(String(init?.body)).ids.length);
    return new Response(JSON.stringify({ read: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    await notificationApi.read(Array.from({ length: 1001 }, (_, i) => `finance:${i}`));
    assert.deepEqual(sizes, [500, 500, 1]);
  } finally {
    globalThis.fetch = original;
  }
});

test('production center uses persistent actions and never completes a task optimistically', () => {
  const source = readFileSync(
    new URL('../src/components/hub/notification-center.tsx', import.meta.url),
    'utf8',
  );
  assert.match(source, /notificationApi\.read/);
  assert.match(source, /notificationApi\.status/);
  assert.match(source, /notificationApi\.clearSales/);
  assert.match(source, /isPrivate\s*\?\s*'\*\*\*\*'/);
  assert.doesNotMatch(source, /setNotifications|previewNotifications|demoTasks/);
});
