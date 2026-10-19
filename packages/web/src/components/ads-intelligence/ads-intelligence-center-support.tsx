'use client';

import type { AdsIntelligenceMetrics } from '@/lib/api-client';

export type MetricKey = Exclude<
  keyof AdsIntelligenceMetrics,
  'calculation_status' | 'calculation_reason'
>;

export const columns: Array<{
  key: MetricKey;
  label: string;
  kind: 'money' | 'count' | 'percent' | 'ratio';
}> = [
  { key: 'spend', label: 'Gasto', kind: 'money' },
  { key: 'impressions', label: 'Impressões', kind: 'count' },
  { key: 'clicks', label: 'Cliques', kind: 'count' },
  { key: 'cpc', label: 'CPC', kind: 'money' },
  { key: 'cpm', label: 'CPM', kind: 'money' },
  { key: 'ctr', label: 'CTR', kind: 'percent' },
  { key: 'hook_rate', label: 'Hook Rate', kind: 'percent' },
  { key: 'ic', label: 'IC', kind: 'count' },
  { key: 'front_sales', label: 'Fronts', kind: 'count' },
  { key: 'upsell_sales', label: 'Upsells', kind: 'count' },
  { key: 'revenue', label: 'Faturamento bruto', kind: 'money' },
  { key: 'roas', label: 'ROAS', kind: 'ratio' },
  { key: 'roi', label: 'ROI de mídia', kind: 'percent' },
];

export const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const numeric = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export const date = (value?: string | null) =>
  value ? new Date(value).toLocaleString('pt-BR') : 'Ainda não realizada';

export const platformLabel = (value?: string) =>
  (({ meta: 'Meta', google: 'Google Ads', tiktok: 'TikTok Ads' }) as Record<string, string>)[
    value ?? ''
  ] ??
  value ??
  'Plataforma não informada';

export const selectClass =
  'min-h-11 w-full min-w-0 max-w-full rounded-lg border border-border bg-background px-3 text-base sm:w-auto sm:text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary';

export const stickyColumnClass =
  'sticky left-0 bg-[var(--color-background)] shadow-[1px_0_0_var(--color-border)]';

export const tableWidth =
  224 + columns.reduce((width, column) => width + (column.key === 'revenue' ? 160 : 115), 0);

export function MetricColumns() {
  return (
    <colgroup>
      <col style={{ width: 224 }} />
      {columns.map((c) => (
        <col key={c.key} style={{ width: c.key === 'revenue' ? 160 : 115 }} />
      ))}
    </colgroup>
  );
}
