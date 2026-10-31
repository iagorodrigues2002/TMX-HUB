import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  CenterNotificationSchema,
  centerSaleAmount,
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

test('center rejects financial movements and unsafe call links at the network boundary', () => {
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
