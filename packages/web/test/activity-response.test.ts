import assert from 'node:assert/strict';
import { test } from 'node:test';
import { endpoints as admin } from '../src/lib/api-client/endpoints-admin';
import { endpoints as tracking } from '../src/lib/api-client/endpoints-tracking-upsell-audit';

test('activity and results reject the synthetic fallback instead of crashing the page', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ notifications: [], offers: [] }));
  await assert.rejects(admin.listActivity());
  await assert.rejects(tracking.getUpsellOperatorLogs(''));
});

test('activity distinguishes an empty feed from an invalid response', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ entries: [] }));
  assert.deepEqual(await admin.listActivity(), []);
});

test('valid activity and results keep their data', async (t) => {
  const entry = { kind: 'clone', id: 'qa', label: 'QA', status: 'ready', createdAt: '2026-11-02' };
  t.mock.method(globalThis, 'fetch', async () => Response.json({ entries: [entry] }));
  assert.deepEqual(await admin.listActivity(), [entry]);
  const results = {
    scope: 'all_offers',
    summary: [],
    unattributed_totals: [],
    approvals: [],
    attempts: [],
    attribution_notice: 'QA',
  };
  t.mock.method(globalThis, 'fetch', async () => Response.json(results));
  assert.deepEqual(await tracking.getUpsellOperatorLogs(''), results);
});

test('unknown activity kinds are rejected before icon rendering', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ entries: [{ kind: 'unknown' }] }));
  await assert.rejects(admin.listActivity());
});
