'use client';

import {
  formatCurrency,
  formatInt,
  formatPercent,
  formatRoas,
} from '@/components/dashboard/kpi-cards';
import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { DataState } from '@/components/ui/data-state';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { Kpi } from '@/components/ui/kpi';
import {
  type DashboardAccountSummary,
  type IntradayRangeSummaryView,
  type MetricsView,
  type OfferSnapshotsView,
  apiClient,
} from '@/lib/api-client';
import {
  DASHBOARD_DATE_PRESETS,
  type DateRange,
  rollingDateRange,
  todayIso,
} from '@/lib/date-range';
import { useQueries, useQuery } from '@tanstack/react-query';
import {
  Eye,
  LayoutDashboard,
  MousePointerClick,
  Percent,
  Receipt,
  ShoppingCart,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';

type OverviewDashboardProps =
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

type TrackingSummaryView = Awaited<ReturnType<typeof apiClient.getTrackingSummary>>;

interface OfferDescriptor {
  id: string;
  name: string;
  currency: string;
  ownerId: string;
  ownerName: string;
}

interface MetricParts {
  spend: number;
  sales: number;
  revenue: number;
  ic: number;
}

interface ChartPoint {
  key: string;
  label: string;
  value: number;
  secondary: number;
}

interface OverviewDataset {
  key: string;
  label: string;
  currency: string;
  offerCount: number;
  totals: MetricsView;
  clicks: number;
  pageViews: number;
  conversionRate: number | null;
  daily: ChartPoint[];
  intraday: ChartPoint[];
}

interface DatasetAccumulator {
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

const emptyMetrics = (): MetricParts => ({ spend: 0, sales: 0, revenue: 0, ic: 0 });

function addMetrics(target: MetricParts, metrics: MetricParts) {
  target.spend += metrics.spend;
  target.sales += metrics.sales;
  target.revenue += metrics.revenue;
  target.ic += metrics.ic;
}

function computedMetrics(parts: MetricParts): MetricsView {
  return {
    ...parts,
    cpa: parts.sales > 0 ? parts.spend / parts.sales : null,
    icCpa: parts.ic > 0 ? parts.spend / parts.ic : null,
    conversionRate: parts.ic > 0 ? parts.sales / parts.ic : null,
    roas: parts.spend > 0 ? parts.revenue / parts.spend : null,
  };
}

function accountOffers(accounts: DashboardAccountSummary[]): OfferDescriptor[] {
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

function shortDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
}

function buildDatasets(
  scope: OverviewDashboardProps['scope'],
  offers: OfferDescriptor[],
  snapshots: Array<OfferSnapshotsView | undefined>,
  summaries: Array<TrackingSummaryView | undefined>,
  intraday: Array<IntradayRangeSummaryView | undefined>,
): OverviewDataset[] {
  const groups = new Map<string, DatasetAccumulator>();

  offers.forEach((descriptor, index) => {
    const snapshot = snapshots[index];
    const summary = summaries[index];
    const intradaySummary = intraday[index];
    const currency = snapshot?.offer.currency ?? descriptor.currency;
    const ownerName =
      scope === 'offer' ? (snapshot?.offer.name ?? descriptor.name) : descriptor.ownerName;
    const key = scope === 'offer' ? descriptor.id : `${descriptor.ownerId}:${currency}`;
    const group: DatasetAccumulator = groups.get(key) ?? {
      key,
      ownerName,
      currency,
      offerNames: [],
      totals: emptyMetrics(),
      clicks: 0,
      pageViews: 0,
      fallbackClicks: 0,
      daily: new Map<string, MetricParts & { clicks: number }>(),
      intraday: new Map<string, { label: string; metrics: MetricParts }>(),
    };

    if (!group.offerNames.includes(descriptor.name)) group.offerNames.push(descriptor.name);

    if (snapshot) {
      addMetrics(group.totals, snapshot.totals);
      for (const day of snapshot.snapshots) {
        group.clicks += day.clicks ?? 0;
        const current = group.daily.get(day.date) ?? { ...emptyMetrics(), clicks: 0 };
        addMetrics(current, day);
        current.clicks += day.clicks ?? 0;
        group.daily.set(day.date, current);
      }
    }

    if (summary) {
      group.pageViews += summary.page_views;
      group.fallbackClicks += summary.ad_clicks;
    }

    for (const window of intradaySummary?.windows ?? []) {
      if (!window.available) continue;
      const current = group.intraday.get(window.label) ?? {
        label: window.label,
        metrics: emptyMetrics(),
      };
      addMetrics(current.metrics, window.metrics);
      group.intraday.set(window.label, current);
    }

    groups.set(key, group);
  });

  return [...groups.values()].map((group) => {
    const totals = computedMetrics(group.totals);
    const pageViewConversion =
      group.pageViews > 0 ? group.totals.sales / group.pageViews : totals.conversionRate;

    return {
      key: group.key,
      label: group.ownerName,
      currency: group.currency,
      offerCount: group.offerNames.length,
      totals,
      clicks: group.clicks || group.fallbackClicks,
      pageViews: group.pageViews,
      conversionRate: pageViewConversion,
      daily: [...group.daily.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([date, metrics]) => ({
          key: date,
          label: shortDate(date),
          value: metrics.revenue,
          secondary: metrics.sales,
        })),
      intraday: [...group.intraday.values()].map((window) => ({
        key: window.label,
        label: window.label,
        value: window.metrics.revenue,
        secondary: window.metrics.sales,
      })),
    };
  });
}

function RevenueChart({
  title,
  description,
  emptyMessage,
  points,
  currency,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  points: ChartPoint[];
  currency: string;
}) {
  const maximum = Math.max(...points.map((point) => point.value), 1);

  return (
    <section className="glass-card overflow-hidden p-0">
      <header className="border-b border-white/[0.06] px-4 py-3">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
        <p className="mt-1 text-xs leading-5 text-white/45">{description}</p>
      </header>
      {points.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-white/45">{emptyMessage}</p>
      ) : (
        <>
          <div className="overflow-x-auto px-4 pb-4 pt-5">
            <div
              aria-hidden="true"
              className="grid h-56 items-end gap-2"
              style={{
                gridTemplateColumns: `repeat(${points.length}, minmax(42px, 1fr))`,
                minWidth: `${Math.max(points.length * 54, 560)}px`,
              }}
            >
              {points.map((point) => (
                <div key={point.key} className="flex h-full min-w-0 flex-col justify-end gap-2">
                  <div className="flex min-h-0 flex-1 items-end justify-center">
                    <div
                      className="w-full max-w-10 rounded-t-md border border-cyan-200/20 bg-cyan-300/35"
                      style={{
                        height: `${point.value > 0 ? Math.max((point.value / maximum) * 100, 4) : 1}%`,
                      }}
                      title={`${point.label}: ${formatCurrency(point.value, currency)} · ${formatInt(point.secondary)} vendas`}
                    />
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-[10px] text-white/55">{point.label}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-emerald-200/75">
                      {formatInt(point.secondary)} v.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <table className="sr-only">
            <caption>{title}</caption>
            <thead>
              <tr>
                <th>Período</th>
                <th>Receita</th>
                <th>Vendas</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.key}>
                  <td>{point.label}</td>
                  <td>{formatCurrency(point.value, currency)}</td>
                  <td>{formatInt(point.secondary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function Dataset({ dataset }: { dataset: OverviewDataset }) {
  return (
    <section
      className="space-y-4 rounded-xl border border-cyan-300/[0.14] bg-cyan-300/[0.025] p-3 sm:p-4"
      data-overview-dataset={dataset.key}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-cyan-300/[0.1] px-1 pb-3">
        <div>
          <p className="hud-label">Escopo dos dados</p>
          <h3 className="mt-1 text-base font-semibold text-white">{dataset.label}</h3>
        </div>
        <p className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1 text-[11px] text-cyan-100/75">
          {dataset.offerCount} {dataset.offerCount === 1 ? 'oferta' : 'ofertas'} ·{' '}
          {dataset.currency}
        </p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi
          label="Vendas"
          value={formatInt(dataset.totals.sales)}
          icon={<ShoppingCart className="h-4 w-4" />}
          tone="positive"
        />
        <Kpi
          label="Receita"
          value={formatCurrency(dataset.totals.revenue, dataset.currency)}
          icon={<Receipt className="h-4 w-4" />}
          tone="positive"
        />
        <Kpi
          label="Cliques"
          value={formatInt(dataset.clicks)}
          hint="Tráfego de mídia"
          icon={<MousePointerClick className="h-4 w-4" />}
        />
        <Kpi
          label="PageView"
          value={formatInt(dataset.pageViews)}
          hint="Visualizações rastreadas"
          icon={<Eye className="h-4 w-4" />}
        />
        <Kpi
          label="Taxa de conversão"
          value={formatPercent(dataset.conversionRate)}
          hint="Vendas / PageView"
          icon={<Percent className="h-4 w-4" />}
        />
        <Kpi
          label="ROAS"
          value={formatRoas(dataset.totals.roas)}
          hint="Receita / investimento"
          icon={<TrendingUp className="h-4 w-4" />}
          tone={dataset.totals.roas !== null && dataset.totals.roas >= 1 ? 'positive' : 'warn'}
        />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <RevenueChart
          title="Série diária"
          description="Receita por dia; o rodapé de cada barra mostra as vendas."
          emptyMessage="Nenhum snapshot diário disponível neste período."
          points={dataset.daily}
          currency={dataset.currency}
        />
        <RevenueChart
          title="Intradiário"
          description="Receita por janela de duas horas, consolidada no período selecionado."
          emptyMessage="A coleta intradiária ainda não produziu janelas completas."
          points={dataset.intraday}
          currency={dataset.currency}
        />
      </div>
    </section>
  );
}

export function OverviewDashboard(props: OverviewDashboardProps) {
  const { scope, initialPeriod } = props;
  const [period, setPeriod] = useState<DateRange>(() => initialPeriod ?? rollingDateRange(7));
  const dashboard = useQuery({
    queryKey: ['dashboard-summary', period.from, period.to],
    queryFn: () => apiClient.getDashboardSummary(period),
    enabled: scope === 'account',
    refetchOnWindowFocus: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const offers: OfferDescriptor[] =
    scope === 'offer'
      ? [
          {
            id: props.offerId,
            name: 'Oferta selecionada',
            currency: 'BRL',
            ownerId: 'offer',
            ownerName: 'Oferta selecionada',
          },
        ]
      : accountOffers(dashboard.data?.accounts ?? []);

  const snapshotQueries = useQueries({
    queries: offers.map((offer) => ({
      queryKey: ['overview-snapshots', offer.id, period.from, period.to],
      queryFn: () => apiClient.getOfferSnapshots(offer.id, period),
      refetchOnWindowFocus: false,
      staleTime: TRACKING_DASHBOARD_STALE_TIME,
    })),
  });
  const trackingQueries = useQueries({
    queries: offers.map((offer) => ({
      queryKey: ['overview-tracking-summary', offer.id, period.from, period.to],
      queryFn: () => apiClient.getTrackingSummary(offer.id, period),
      retry: false,
      staleTime: TRACKING_DASHBOARD_STALE_TIME,
    })),
  });
  const intradayQueries = useQueries({
    queries: offers.map((offer) => ({
      queryKey: ['overview-intraday', offer.id, period.from, period.to],
      queryFn: () => apiClient.getOfferIntradayRange(offer.id, period.from, period.to),
      retry: false,
      refetchOnWindowFocus: false,
      staleTime: TRACKING_DASHBOARD_STALE_TIME,
    })),
  });

  const datasets = buildDatasets(
    scope,
    offers,
    snapshotQueries.map((query) => query.data),
    trackingQueries.map((query) => query.data),
    intradayQueries.map((query) => query.data),
  );
  const detailQueries = [...snapshotQueries, ...trackingQueries, ...intradayQueries];
  const isLoading =
    (scope === 'account' && dashboard.isLoading) || detailQueries.some((query) => query.isLoading);
  const isFetching = dashboard.isFetching || detailQueries.some((query) => query.isFetching);
  const hasPartialError =
    dashboard.isError || detailQueries.some((query) => query.isError && !query.data);
  const hasFatalError =
    (scope === 'account' && dashboard.isError && !dashboard.data) ||
    (offers.length > 0 && snapshotQueries.every((query) => query.isError && !query.data));

  const refresh = () => {
    if (scope === 'account') void dashboard.refetch();
    for (const query of detailQueries) void query.refetch();
  };

  const scopeDescription =
    scope === 'account'
      ? 'Todas as ofertas acessíveis, separadas por conta e moeda.'
      : 'A mesma leitura operacional, filtrada pela oferta ativa.';

  return (
    <div className="space-y-5" data-overview-dashboard data-overview-scope={scope}>
      <section className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-4 sm:p-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08]">
            <LayoutDashboard aria-hidden className="h-4.5 w-4.5 text-cyan-300" />
          </div>
          <div>
            <h2 className="text-sm font-semibold text-white">Visão geral</h2>
            <p className="mt-1 text-sm leading-6 text-white/50">{scopeDescription}</p>
          </div>
        </div>
        <DateRangeFilter
          value={period}
          onChange={setPeriod}
          presets={DASHBOARD_DATE_PRESETS}
          max={todayIso()}
          isRefreshing={isFetching}
          onRefresh={refresh}
          className="mt-4"
          status={
            offers.length > 0 ? (
              <span className="hud-label pb-2">
                {offers.length} {offers.length === 1 ? 'oferta' : 'ofertas'} no escopo
              </span>
            ) : null
          }
        />
      </section>

      {isLoading ? (
        <DataState variant="loading" title="Carregando visão geral…" />
      ) : hasFatalError ? (
        <DataState
          variant="error"
          title="Não foi possível carregar a visão geral"
          description="Os filtros foram preservados. Tente consultar este período novamente."
          isRetrying={isFetching}
          onRetry={refresh}
        />
      ) : offers.length === 0 ? (
        <DataState
          variant="empty"
          title="Nenhuma oferta disponível"
          description="Cadastre ou libere uma oferta para começar a acompanhar os resultados."
        />
      ) : (
        <>
          {hasPartialError && (
            <output
              aria-live="polite"
              className="block rounded-xl border border-warning/25 bg-warning/[0.07] px-4 py-3 text-sm text-warning"
            >
              Parte das fontes não respondeu. Os módulos disponíveis continuam visíveis abaixo.
            </output>
          )}
          {datasets.map((dataset) => (
            <Dataset key={dataset.key} dataset={dataset} />
          ))}
        </>
      )}
    </div>
  );
}
