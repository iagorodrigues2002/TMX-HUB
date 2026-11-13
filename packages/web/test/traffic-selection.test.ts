import assert from 'node:assert/strict';
import test from 'node:test';
import type { RealCampaignSnapshot } from '../src/components/traffic/real-campaigns-model';
import type { ReportRow } from '../src/components/traffic/traffic-reports-model';
import {
  type TrafficSelection,
  filterTrafficSelection,
  selectionForLevel,
} from '../src/components/traffic/traffic-selection';
const insights = [
  { campaignId: 'c1', adsetId: 's1', adId: 'a1' },
  { campaignId: 'c1', adsetId: 's2', adId: 'a2' },
  { campaignId: 'c2', adsetId: 's3', adId: 'a3' },
  { campaignId: 'c3', adsetId: 's4', adId: 'a4' },
] as RealCampaignSnapshot['insights'];
const rows = (ids: string[]) => ids.map((id) => ({ id })) as ReportRow[];
const empty: TrafficSelection = { campaigns: [], adsets: [], ads: [] };
test('returning to campaigns discards child selection before direct ad navigation', () => {
  const back = selectionForLevel({ campaigns: ['c1'], adsets: ['s1'], ads: ['a1'] }, 'campaigns');
  assert.deepEqual(back, { campaigns: ['c1'], adsets: [], ads: [] });
  assert.deepEqual(
    filterTrafficSelection(rows(['a1', 'a2', 'a3']), insights, 'ads', back).map((row) => row.id),
    ['a1', 'a2'],
  );
});
test('without selection each child level remains complete', () => {
  for (const level of ['adsets', 'ads'] as const) {
    const all = rows(['s1', 's2', 's3', 's4', 'a1', 'a2', 'a3', 'a4']);
    assert.equal(filterTrafficSelection(all, insights, level, empty), all);
  }
});
test('one or multiple campaigns scope sets and direct ad navigation by IDs', () => {
  assert.deepEqual(
    filterTrafficSelection(rows(['s1', 's2', 's3', 's4']), insights, 'adsets', {
      ...empty,
      campaigns: ['c1', 'c2'],
    }).map((row) => row.id),
    ['s1', 's2', 's3'],
  );
  assert.deepEqual(
    filterTrafficSelection(rows(['a1', 'a2', 'a3', 'a4']), insights, 'ads', {
      ...empty,
      campaigns: ['c1'],
    }).map((row) => row.id),
    ['a1', 'a2'],
  );
});
test('selected sets take precedence; empty sets retain the campaign scope', () => {
  const all = rows(['a1', 'a2', 'a3', 'a4']);
  assert.deepEqual(
    filterTrafficSelection(all, insights, 'ads', {
      ...empty,
      campaigns: ['c1'],
      adsets: ['s2'],
    }).map((row) => row.id),
    ['a2'],
  );
  assert.deepEqual(
    filterTrafficSelection(all, insights, 'ads', { ...empty, campaigns: ['c1'] }).map(
      (row) => row.id,
    ),
    ['a1', 'a2'],
  );
});
test('unknown parents never fall back to unrelated results and campaigns stay navigable', () => {
  const all = rows(['a1']);
  assert.deepEqual(
    filterTrafficSelection(all, insights, 'ads', { ...empty, campaigns: ['missing'] }),
    [],
  );
  assert.equal(
    filterTrafficSelection(all, insights, 'campaigns', { ...empty, campaigns: ['missing'] }),
    all,
  );
});
