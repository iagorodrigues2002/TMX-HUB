'use client';

import type { DashboardAccountSummary, MetricsView, apiClient } from '@/lib/api-client';
import type { DateRange } from '@/lib/date-range';

export type OverviewDashboardProps =
  | {
      scope: 'account';
      offerId?: never;
      initialPeriod?: DateRange;
    }
  | {
      scope: 'offer';
      offerId: string;
      initialPeriod?: DateRange;
    };

export type TrackingSummaryView = Awaited<ReturnType<typeof apiClient.getTrackingSummary>>;

export interface OfferDescriptor {
  id: string;
  name: string;
  currency: string;
  ownerId: string;
  ownerName: string;
}

export interface MetricParts {
  spend: number;
  sales: number;
  revenue: number;
  ic: number;
}

export interface ChartPoint {
  key: string;
  label: string;
  value: number;
  secondary: number;
}

export interface OverviewDataset {
  arpu?: number | null;
  key: string;
  label: string;
  currency: string;
  offerCount: number;
  totals: MetricsView;
  clicks: number;
  pageViews: number;
  conversionRate: number | null;
  offerIds?: string[];
  daily: ChartPoint[];
  intraday: ChartPoint[];
  intradayUnavailableReason?: string;
  finance: {
    fees: number;
    reserve: number;
    net: number | null;
    available: number | null;
    missingFeeOperations?: number;
    refunds: number;
    penalties: number;
    impact: number | null;
    refundPercentage: number | null;
    impactPercentage: number | null;
  } | null;
}

export interface DatasetAccumulator {
  key: string;
  ownerName: string;
  currency: string;
  offerNames: string[];
  totals: MetricParts;
  clicks: number;
  pageViews: number;
  fallbackClicks: number;
  daily: Map<string, MetricParts & { clicks: number }>;
  intraday: Map<string, { label: string; metrics: MetricParts }>;
}

export const KPI_SKELETONS = [
  'clicks',
  'page-views',
  'checkouts',
  'sales',
  'revenue',
  'conversion',
];

export const emptyMetrics = (): MetricParts => ({ spend: 0, sales: 0, revenue: 0, ic: 0 });

export function addMetrics(target: MetricParts, metrics: MetricParts) {
  target.spend += metrics.spend;
  target.sales += metrics.sales;
  target.revenue += metrics.revenue;
  target.ic += metrics.ic;
}

export function computedMetrics(parts: MetricParts): MetricsView {
  return {
    ...parts,
    cpa: parts.sales > 0 ? parts.spend / parts.sales : null,
    icCpa: parts.ic > 0 ? parts.spend / parts.ic : null,
    conversionRate: parts.ic > 0 ? parts.sales / parts.ic : null,
    roas: parts.spend > 0 ? parts.revenue / parts.spend : null,
  };
}

const compactNumber = new Intl.NumberFormat('pt-BR', {
  notation: 'compact',
  maximumFractionDigits: 1,
});
const conversionRate = new Intl.NumberFormat('pt-BR', {
  style: 'percent',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCompactNumber(value: number) {
  return compactNumber.format(value);
}

export function formatConversionRate(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return conversionRate.format(value);
}

export function accountOffers(accounts: DashboardAccountSummary[]): OfferDescriptor[] {
  return accounts.flatMap((account) =>
    account.offers.map(({ offer }) => ({
      id: offer.id,
      name: offer.name,
      currency: offer.currency,
      ownerId: account.ownerId,
      ownerName: account.ownerName,
    })),
  );
}

export function selectedOverviewDataset<T extends { key: string }>(
  datasets: T[],
  selected: string,
  userId: string | undefined,
) {
  return (
    datasets.find((item) => item.key === selected) ??
    datasets.find((item) => userId && item.key.startsWith(`${userId}:`)) ??
    datasets[0]
  );
}

export function shortDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

export function OverviewLoadingSkeleton() {
  return (
    <section
      aria-label="Carregando indicadores da visão geral"
      aria-live="polite"
      className="glass-card space-y-4 rounded-xl border border-border bg-accent p-3 sm:p-4"
    >
      <div className="h-12 animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {KPI_SKELETONS.map((skeleton) => (
          <div
            key={skeleton}
            className="glass-card h-[116px] animate-pulse rounded-xl border border-border bg-muted motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="glass-card h-72 animate-pulse rounded-xl border border-border bg-muted motion-reduce:animate-none" />
        <div className="glass-card h-72 animate-pulse rounded-xl border border-border bg-muted motion-reduce:animate-none" />
      </div>
    </section>
  );
}
