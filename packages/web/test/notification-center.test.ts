import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isActiveNotification, saleClickDetail } from '../src/lib/notification-center';

test('sale cards show the credited operator, or natural sale only when no click is credited', () => {
  assert.deepEqual(saleClickDetail({ operatorId: 'operator-1', operatorName: 'Douglas Riti' }), { label: 'Último clique', value: 'Douglas Riti' });
  assert.deepEqual(saleClickDetail(null), { label: 'Origem', value: 'Venda natural' });
  assert.deepEqual(saleClickDetail({ operatorId: 'deleted-user', operatorName: null }), { label: 'Último clique', value: 'Usuário não identificado' });
});

test('sales disappear only after being read', () => {
  assert.equal(isActiveNotification({ kind: 'sale', unread: true }), true);
  assert.equal(isActiveNotification({ kind: 'sale', unread: false }), false);
});

test('reading a task never removes it; completion removes even an unread task', () => {
  for (const unread of [true, false]) {
    for (const status of ['Pendente', 'Em progresso']) {
      assert.equal(isActiveNotification({ kind: 'task', unread, status }), true);
    }
    assert.equal(isActiveNotification({ kind: 'task', unread, status: 'Concluído' }), false);
  }
});
