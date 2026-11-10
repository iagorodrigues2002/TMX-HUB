import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  isActiveNotification,
  saleClickDetail,
  saleKindBadge,
} from '../src/lib/notification-center';

test('sale badges recognize numbered upsells, including the reported Upsell 3', () => {
  assert.deepEqual(saleKindBadge('front'), { label: 'Venda principal', variant: 'success' });
  assert.deepEqual(saleKindBadge(null), { label: 'Venda principal', variant: 'success' });
  assert.deepEqual(saleKindBadge('upsell'), { label: 'Upsell', variant: 'warning' });
  for (const stage of [2, 3, 9, 10, 19, 20, 99]) {
    assert.deepEqual(saleKindBadge(`upsell_${stage}`), {
      label: `Upsell ${stage}`,
      variant: 'warning',
    });
  }
});

test('sale cards show the credited operator, or natural sale only when no click is credited', () => {
  assert.deepEqual(saleClickDetail({ operatorId: 'operator-1', operatorName: 'Douglas Riti' }), {
    label: 'Último clique',
    value: 'Douglas Riti',
  });
  assert.deepEqual(saleClickDetail(null), { label: 'Origem', value: 'Venda natural' });
  assert.deepEqual(saleClickDetail({ operatorId: 'deleted-user', operatorName: null }), {
    label: 'Último clique',
    value: 'Usuário não identificado',
  });
});

test('sales disappear only after being read', () => {
  assert.equal(isActiveNotification({ kind: 'sale', unread: true }), true);
  assert.equal(isActiveNotification({ kind: 'sale', unread: false }), false);
});

test('inherited funnel credit is identified without claiming a click on that stage', () => {
  assert.deepEqual(
    saleClickDetail({ operatorId: 'douglas', operatorName: 'Douglas Riti', viaSequence: true }),
    {
      label: 'Sequência de upsell',
      value: 'Douglas Riti',
    },
  );
});

test('reading a task never removes it; completion removes even an unread task', () => {
  for (const unread of [true, false]) {
    for (const status of ['Pendente', 'Em progresso']) {
      assert.equal(isActiveNotification({ kind: 'task', unread, status }), true);
    }
    assert.equal(isActiveNotification({ kind: 'task', unread, status: 'Concluído' }), false);
  }
});
