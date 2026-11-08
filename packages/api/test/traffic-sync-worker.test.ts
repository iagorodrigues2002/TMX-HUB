import assert from 'node:assert/strict';
import { it as test } from 'vitest';
import {
  OWNER,
  PREFIX,
  RETENTION,
  days,
  normalizeFinance,
  syncPeriod,
  validRange,
} from '../scripts/traffic-sync-server.mjs';

const offer = {
  offer_id: 'offer',
  offer_name: 'PJR_ESP',
  owner_id: OWNER,
  fees_missing_operations: 0,
  gross_revenue_brl_minor: '1000',
  gross_revenue_usd_minor: '200',
  net_available_brl_minor: '700',
  net_available_usd_minor: '140',
  secret: 'must-not-leak',
};
test('server validates calendar ranges and São Paulo rollover', () => {
  assert.equal(validRange('2026-02-30', '2026-03-01'), false);
  assert.equal(validRange('2026-11-08', '2026-11-07'), false);
  assert.equal(validRange('2025-01-01', '2026-11-08'), false);
  assert.equal(validRange('2026-11-07', '2026-11-08'), true);
  assert.deepEqual(days(new Date('2026-11-09T01:00:00Z')), {
    today: '2026-11-08',
    yesterday: '2026-11-07',
  });
});
test('financial cache includes only the pinned owner and allowlisted exact minor amounts', () => {
  const data = normalizeFinance(
    { from: '2026-11-07', to: '2026-11-07', offers: [offer, { ...offer, owner_id: 'other' }] },
    OWNER,
    '2026-11-07',
    '2026-11-07',
  );
  assert.equal(data.offers.length, 1);
  assert.equal(data.offers[0].net_available_brl_minor, '700');
  assert.ok(!JSON.stringify(data).includes('must-not-leak'));
  assert.throws(
    () =>
      normalizeFinance(
        {
          from: '2026-11-07',
          to: '2026-11-07',
          offers: [{ ...offer, net_available_brl_minor: 'NaN' }],
        },
        OWNER,
        '2026-11-07',
        '2026-11-07',
      ),
    /invalid_finance/,
  );
});
test('publishes atomically only after Meta and finance succeed and lease still belongs to the worker', async () => {
  const calls = [];
  const range = { from: '2026-11-07', to: '2026-11-07' };
  const dependencies = {
    ...range,
    token: 'synthetic',
    redis: { set: async (...args) => calls.push(args) },
    readMeta: async () => ({ snapshot: { ...range }, inventory: [] }),
    readFinance: async () => ({ ...range, ownerId: OWNER }),
  };
  await syncPeriod(dependencies);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], `${PREFIX}snapshot:2026-11-07:2026-11-07`);
  assert.equal(calls[0][3], RETENTION);
  calls.length = 0;
  await assert.rejects(
    syncPeriod({
      ...dependencies,
      readFinance: async () => {
        throw Error('upstream');
      },
    }),
    /upstream/,
  );
  assert.equal(calls.length, 0);
  await assert.rejects(
    syncPeriod({ ...dependencies, readFinance: async () => ({ ...range, ownerId: 'foreign' }) }),
    /invalid_finance_owner/,
  );
  assert.equal(calls.length, 0);
  await assert.rejects(
    syncPeriod({ ...dependencies, canPublish: async () => false }),
    /lease_lost/,
  );
  assert.equal(calls.length, 0);
  await assert.rejects(
    syncPeriod({
      ...dependencies,
      lock: 'lost',
      redis: { ...dependencies.redis, eval: async () => 0 },
    }),
    /lease_lost/,
  );
  assert.equal(calls.length, 0);
});
