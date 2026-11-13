import type { RealCampaignSnapshot } from './real-campaigns-model';
import type { ImportedInventory } from './traffic-model';

export function accountGroup(status: ImportedInventory['accounts'][number]['status'] | undefined) {
  return status === 'Ativo' ? 'Contas ativas' : status === 'Desabilitado' ? 'Contas desativadas' : 'Status não confirmado';
}

export function detailSnapshot(data: RealCampaignSnapshot, id: string, level: 'campaigns' | 'adsets' | 'ads') {
  const matches = (row: RealCampaignSnapshot['insights'][number]) =>
    (level === 'campaigns' ? row.campaignId : level === 'adsets' ? row.adsetId : row.adId) === id;
  const insights = data.insights.filter(matches);
  const campaigns = new Set(insights.map(row => row.campaignId));
  return { ...data, campaigns: data.campaigns.filter(row => campaigns.has(row.id) || (level === 'campaigns' && row.id === id)), insights, hourly: data.hourly?.filter(matches) };
}

export function hourlyDetail(data: RealCampaignSnapshot, date: string, start: number, end: number) {
  if (date < data.from || date > data.to || start < 0 || end > 24 || start >= end || !Number.isInteger(start) || !Number.isInteger(end)) return null;
  if (!data.hourly || data.campaigns.some(c => data.hourlyFailures?.includes(c.accountId) || data.failures.some(f => f.accountId === c.accountId))) return null;
  const insights = data.hourly.filter(row => row.date === date && row.hour !== undefined && row.hour >= start && row.hour < end);
  // An empty hourly response is not proof of zero delivery.
  return insights.length ? { ...data, insights } : null;
}
