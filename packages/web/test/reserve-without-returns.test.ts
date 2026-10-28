import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reserveWithoutReturns } from '../src/lib/reserve-without-returns';

test('subtracts returned purchases in integer cents without changing the original reserve', () => {
  const day = { reserve_brl_minor: 18530, reversed_reserve_brl_minor: 10651 };
  assert.equal(reserveWithoutReturns(day), 7879);
  assert.equal(day.reserve_brl_minor, 18530);
  assert.equal(
    reserveWithoutReturns({ reserve_brl_minor: 690, reversed_reserve_brl_minor: 690 }),
    0,
  );
  assert.equal(
    reserveWithoutReturns({ reserve_brl_minor: 690, reversed_reserve_brl_minor: 0 }),
    690,
  );
});
