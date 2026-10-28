import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  enqueueSaleNotices,
  saleNoticeTotals,
  takeNewApproved,
} from '../src/lib/sale-notification';

const started = Date.now() - 60_000;
const order = (id: string, status = 'paid', time = started + 1000) => ({
  id,
  status,
  occurred_at: new Date(time).toISOString(),
});
test('a burst preserves the visible batch and coalesces all waiting sales without duplicates', () => {
  const visible = [order('visible')];
  let queue = [visible];
  for (let index = 0; index < 100; index++) {
    queue = enqueueSaleNotices(queue, [
      order(String(index)),
      order(String(index)),
      order('visible'),
    ]);
  }
  assert.equal(queue.length, 2);
  assert.equal(queue[0], visible);
  assert.equal(queue[1].length, 100);
  assert.equal(new Set(queue.flat().map((notice) => notice.id)).size, 101);
  const next = queue.slice(1);
  const appended = enqueueSaleNotices(next, [order('later')]);
  assert.equal(appended[0], next[0]);
  assert.equal(appended[1][0].id, 'later');
});
test('simultaneous arrivals start as one popup and empty arrivals preserve identity', () => {
  const queue = enqueueSaleNotices([], [order('a'), order('b')]);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].length, 2);
  assert.equal(enqueueSaleNotices(queue, []), queue);
});
test('grouped totals never sum different currencies or fabricate missing amounts', () => {
  assert.deepEqual(
    saleNoticeTotals([
      { amount_minor: '2900', currency: 'BRL' },
      { amount_minor: '1500', currency: 'BRL' },
      { amount_minor: '1700', currency: 'USD' },
      { amount_minor: null, currency: 'BRL' },
      { amount_minor: 'invalid', currency: 'USD' },
    ]),
    {
      totals: [
        ['BRL', 4400],
        ['USD', 1700],
      ],
      unknown: 2,
    },
  );
});
test('ignores old sales, invalid dates and non-approved orders', () => {
  assert.deepEqual(
    takeNewApproved(
      [
        order('old', 'paid', started - 1),
        order('pending', 'pending'),
        { ...order('bad'), occurred_at: 'invalid' },
      ],
      new Set(),
      started,
    ),
    [],
  );
});
test('new approval is delivered once despite duplicate webhooks or repeated polls', () => {
  const seen = new Set<string>();
  assert.equal(takeNewApproved([order('new'), order('new')], seen, started).length, 1);
  assert.equal(takeNewApproved([order('new')], seen, started).length, 0);
});
test('pending orders can become approved, while restored seen IDs remain deduplicated', () => {
  const seen = new Set(['already-seen']);
  assert.equal(takeNewApproved([order('pending', 'pending')], seen, started).length, 0);
  assert.deepEqual(
    takeNewApproved([order('pending'), order('already-seen')], seen, started).map((row) => row.id),
    ['pending'],
  );
});
