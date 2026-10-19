import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatRefundDate, formatRefundElapsed } from '../src/lib/refund-dates';

test('shows the elapsed interval without inventing missing or reversed dates', () => {
  const purchase = '2026-09-01T12:00:00Z';
  assert.equal(formatRefundElapsed(purchase, '2026-09-11T12:00:00Z', false), '10 dias');
  assert.equal(formatRefundElapsed(purchase, '2026-09-02T12:00:00Z', false), '1 dia');
  assert.equal(formatRefundElapsed(purchase, '2026-09-01T13:00:00Z', false), 'Menos de 1 dia');
  assert.equal(formatRefundElapsed(purchase, purchase, false), 'Mesmo instante registrado');
  assert.equal(
    formatRefundElapsed(purchase, '2026-08-31T12:00:00Z', false),
    'Datas inconsistentes',
  );
  assert.equal(formatRefundElapsed(null, purchase, false), 'Sem datas suficientes');
  assert.equal(formatRefundElapsed('invalid', purchase, false), 'Sem datas suficientes');
});

test('formats Sao Paulo dates and masks dates and elapsed intervals in privacy mode', () => {
  assert.match(formatRefundDate('2026-09-01T01:00:00Z', false), /31\/08\/2026/);
  assert.equal(formatRefundDate('invalid', false), 'Não identificada');
  assert.equal(formatRefundDate(null, false), 'Não identificada');
  assert.equal(formatRefundDate('2026-09-01T12:00:00Z', true), '****');
  assert.equal(formatRefundElapsed(null, null, true), '****');
});
