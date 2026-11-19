import assert from 'node:assert/strict';
import { test } from 'node:test';
import { refundOriginLabel } from '../src/lib/refund-origin';

test('refund audit distinguishes assisted, natural and missing attribution', () => {
  assert.equal(refundOriginLabel('assisted'), 'Com clique');
  assert.equal(refundOriginLabel('natural'), 'Sem clique');
  for (const missing of [undefined, null, 'unknown', '', 'unexpected'])
    assert.equal(refundOriginLabel(missing), 'Não identificado');
});
