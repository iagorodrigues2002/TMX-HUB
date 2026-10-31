import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  callDate,
  callInputDate,
  callStartIso,
  parseCallReminders,
  reminderLabel,
} from '../src/lib/call-dashboard';

test('call datetime input is interpreted in Sao Paulo, not the browser timezone', () => {
  assert.equal(callStartIso('2026-11-02T10:30'), '2026-11-02T13:30:00.000Z');
  assert.equal(callInputDate('2026-11-02T13:30:00.000Z'), '2026-11-02T10:30');
  assert.match(callDate('2026-11-02T13:30:00.000Z'), /10:30/);
});

test('reminder input does not silently convert blanks to zero or duplicate sends', () => {
  assert.deepEqual(parseCallReminders('30, 5, 0'), [30, 5, 0]);
  for (const value of ['', '30,,5', '5,5', '-1', '1441', 'abc'])
    assert.throws(() => parseCallReminders(value));
});

test('invalid and normalized calendar dates are rejected before saving', () => {
  for (const value of ['', 'bad', '2026-02-30T10:30', '2026-11-02T25:30'])
    assert.throws(() => callStartIso(value));
  assert.equal(reminderLabel(0), 'No horário');
  assert.equal(reminderLabel(30), '30 min antes');
});
