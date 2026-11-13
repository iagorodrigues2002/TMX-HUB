import type { RealCampaignSnapshot } from './real-campaigns-model';
import type { ReportRow } from './traffic-reports-model';
export type TrafficSelection = { campaigns: string[]; adsets: string[]; ads: string[] };
export function selectionForLevel(
  selection: TrafficSelection,
  level: keyof TrafficSelection,
): TrafficSelection {
  return level === 'campaigns'
    ? { ...selection, adsets: [], ads: [] }
    : level === 'adsets'
      ? { ...selection, ads: [] }
      : selection;
}
export function filterTrafficSelection(
  rows: ReportRow[],
  insights: RealCampaignSnapshot['insights'],
  level: keyof TrafficSelection,
  selection: TrafficSelection,
) {
  const parents =
    level === 'ads' && selection.adsets.length ? selection.adsets : selection.campaigns;
  if (level === 'campaigns' || !parents.length) return rows;
  const selected = new Set(parents);
  const allowed = new Set(
    insights
      .filter((row) =>
        level === 'ads' && selection.adsets.length
          ? !!row.adsetId && selected.has(row.adsetId)
          : selected.has(row.campaignId),
      )
      .map((row) => (level === 'adsets' ? row.adsetId : row.adId)),
  );
  return rows.filter((row) => allowed.has(row.id));
}
