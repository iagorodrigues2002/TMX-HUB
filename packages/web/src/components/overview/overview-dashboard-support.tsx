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

export function formatCompactNumber(value: number) {
  return new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: 1,
  }).format(value);
}

export function formatConversionRate(value: number | null) {
  if (value === null || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('pt-BR', {
    style: 'percent',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
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
      className="space-y-4 rounded-xl border border-cyan-300/[0.14] bg-cyan-300/[0.025] p-3 sm:p-4"
    >
      <div className="h-12 animate-pulse rounded-lg bg-white/[0.04] motion-reduce:animate-none" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {KPI_SKELETONS.map((skeleton) => (
          <div
            key={skeleton}
            className="h-[116px] animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.035] motion-reduce:animate-none"
          />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        <div className="h-72 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.025] motion-reduce:animate-none" />
        <div className="h-72 animate-pulse rounded-xl border border-white/[0.06] bg-white/[0.025] motion-reduce:animate-none" />
      </div>
    </section>
  );
}
