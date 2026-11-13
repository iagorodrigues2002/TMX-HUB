import assert from 'node:assert/strict';
import test from 'node:test';
import { accountGroup, detailSnapshot, hourlyDetail } from '../src/components/traffic/traffic-detail-model';
import type { RealCampaignSnapshot } from '../src/components/traffic/real-campaigns-model';

const insight = (adId: string, hour: number) => ({ accountId: '1', campaignId: '10', adsetId: '20', adId, date: '2026-11-12', hour, currency: 'BRL', spend: '10', impressions: '100', linkClicks: '10', actions: [] });
const snapshot: RealCampaignSnapshot = { fetchedAt: '', from: '2026-11-12', to: '2026-11-12', accounts: [], campaigns: [{ id: '10', name: 'C', accountId: '1', status: 'ACTIVE', effectiveStatus: 'ACTIVE', objective: '', createdAt: null, updatedAt: null }], insights: [insight('30', 8), insight('31', 9)], hourly: [insight('30', 8), insight('30', 9), insight('31', 8)], failures: [] };
test('separates confirmed account status and never treats unknown as disabled', () => {
  assert.equal(accountGroup('Ativo'), 'Contas ativas');
  assert.equal(accountGroup('Desabilitado'), 'Contas desativadas');
  assert.equal(accountGroup(null), 'Status não confirmado');
});
test('ad detail and hourly comparison exclude sibling ads and exclusive end hour', () => {
  const data = detailSnapshot(snapshot, '30', 'ads');
  assert.equal(data.insights.length, 1);
  assert.equal(data.hourly?.length, 2);
  assert.equal(hourlyDetail(data, '2026-11-12', 8, 9)?.insights.length, 1);
  assert.equal(detailSnapshot(snapshot, '10', 'campaigns').insights.length, 2);
  assert.equal(detailSnapshot(snapshot, '20', 'adsets').insights.length, 2);
});
test('missing, failed, invalid and uncovered hourly intervals stay unavailable', () => {
  assert.equal(hourlyDetail(snapshot, '2026-11-12', 10, 8), null);
  assert.equal(hourlyDetail(snapshot, '2026-11-11', 8, 9), null);
  assert.equal(hourlyDetail(snapshot, '2026-11-12', 15, 16), null);
  assert.equal(hourlyDetail({ ...snapshot, hourlyFailures: ['1'] }, '2026-11-12', 8, 9), null);
});
