'use client';

import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { DataState } from '@/components/ui/data-state';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { DataPendingContext } from '@/lib/data-pending';
import {
  DASHBOARD_DATE_PRESETS,
  type DateRange,
  rollingDateRange,
  todayIso,
} from '@/lib/date-range';
import { INTRADAY_RANGE_LIMIT_MESSAGE, supportsIntradayRange } from '@/lib/intraday-range';
import { getSessionGeneration } from '@/lib/session-data';
import { useQueries, useQuery } from '@tanstack/react-query';
import { LayoutGrid } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { GatewayOverview } from './gateway-overview';
import {
  buildDatasets,
  hasCompleteOverviewScope,
  overviewDetailOfferIds,
} from './overview-dashboard-build-datasets';
import { Dataset } from './overview-dashboard-dataset';
import {
  type OfferDescriptor,
  type OverviewDashboardProps,
  accountOffers,
} from './overview-dashboard-support';
import { periodArpu, useSalesComposition } from './sales-composition';
import { SIGNAL_PREVIEW, SignalPreview } from './signal-preview';
import { useSettledOverviewFilters } from './use-settled-overview-filters';

export function OverviewDashboard(props: OverviewDashboardProps) {
  const { scope, initialPeriod } = props;
  const { user } = useAuth();
  const [period, setPeriod] = useState<DateRange>(() => initialPeriod ?? rollingDateRange(7));
  const [salesView, setSalesView] = useState<'general' | 'natural'>('general');
  const [selectedDataset, setSelectedDataset] = useState('');
  const {
    period: queryPeriod,
    salesView: queryView,
    pending: filtersPending,
  } = useSettledOverviewFilters(period, salesView);
  const financialQuery = useQuery({
    queryKey: ['overview-financial', queryPeriod.from, queryPeriod.to, queryView],
    queryFn: ({ signal }) =>
      apiClient.getTrackingOverview(queryPeriod.from, queryPeriod.to, queryView, signal),
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const dashboard = useQuery({
    queryKey: ['dashboard-summary', queryPeriod.from, queryPeriod.to],
    queryFn: ({ signal }) => apiClient.getDashboardSummary(queryPeriod, signal),
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

  const detailOfferIds = overviewDetailOfferIds(
    offers,
    scope,
    selectedDataset,
    user?.id,
    financialQuery.data?.offers,
    !SIGNAL_PREVIEW || financialQuery.isError,
  );
  const snapshotQueries = useQueries({
    queries: offers.map((offer) => ({
      queryKey: ['overview-snapshots', offer.id, queryPeriod.from, queryPeriod.to],
      queryFn: ({ signal }) => apiClient.getOfferSnapshots(offer.id, queryPeriod, signal),
      enabled: detailOfferIds.has(offer.id),
      refetchOnWindowFocus: false,
      staleTime: TRACKING_DASHBOARD_STALE_TIME,
    })),
  });
  const trackingQueries = useQueries({
    queries: offers.map((offer) => ({
      queryKey: [
        'overview-tracking-summary',
        offer.id,
        queryPeriod.from,
        queryPeriod.to,
        queryView,
      ],
      queryFn: ({ signal }) =>
        apiClient.getTrackingSummary(offer.id, queryPeriod, queryView, signal),
      enabled: detailOfferIds.has(offer.id),
      staleTime: TRACKING_DASHBOARD_STALE_TIME,
    })),
  });
  const intradayEnabled = queryView === 'general' && supportsIntradayRange(queryPeriod);
  const intradayQueries = useQueries({
    queries: offers.map((offer) => ({
      queryKey: ['overview-intraday', offer.id, queryPeriod.from, queryPeriod.to],
      queryFn: ({ signal }) =>
        apiClient.getOfferIntradayRange(offer.id, queryPeriod.from, queryPeriod.to, signal),
      enabled: intradayEnabled && detailOfferIds.has(offer.id),
      refetchOnWindowFocus: false,
      staleTime: TRACKING_DASHBOARD_STALE_TIME,
    })),
  });

  const composition = useSalesComposition(queryPeriod.from, queryPeriod.to);
  const datasets = buildDatasets(
    scope,
    offers,
    snapshotQueries.map((query) => query.data),
    trackingQueries.map((query) => query.data),
    intradayQueries.map((query) => (intradayEnabled ? query.data : undefined)),
    financialQuery.data?.offers,
  ).map((dataset) => ({
    ...dataset,
    arpu: periodArpu(composition.data, dataset.offerIds ?? [], queryView),
    daily: queryView === 'general' ? dataset.daily : [],
    intradayUnavailableReason:
      queryView === 'general' && !intradayEnabled ? INTRADAY_RANGE_LIMIT_MESSAGE : undefined,
  }));
  const requiredQuery = (_query: unknown, index: number) => {
    const offer = offers[index];
    return offer ? detailOfferIds.has(offer.id) : false;
  };
  const activeSnapshotQueries = snapshotQueries.filter(requiredQuery);
  const activeIntradayQueries = intradayQueries.filter(requiredQuery);
  const detailQueries = [
    ...activeSnapshotQueries,
    ...trackingQueries.filter(requiredQuery),
    ...(intradayEnabled ? activeIntradayQueries : []),
    financialQuery,
    composition,
  ];
  const isLoading =
    filtersPending ||
    (scope === 'account' && dashboard.isLoading) ||
    detailQueries.some((query) => query.isLoading);
  const isFetching =
    filtersPending || dashboard.isFetching || detailQueries.some((query) => query.isFetching);
  const hasPartialError =
    dashboard.isError || detailQueries.some((query) => query.isError && !query.data);
  const hasFatalError =
    (scope === 'account' && dashboard.isError && !dashboard.data) ||
    (activeSnapshotQueries.length > 0 &&
      activeSnapshotQueries.every((query) => query.isError && !query.data));

  const identity = `${getSessionGeneration()}:${scope}:${props.offerId ?? ''}`;
  const committed = useRef<{
    identity: string;
    datasets: typeof datasets;
    financial: typeof financialQuery.data;
  } | null>(null);
  useLayoutEffect(() => {
    if (!isLoading && !hasFatalError && hasCompleteOverviewScope(offers, datasets))
      committed.current = { identity, datasets, financial: financialQuery.data };
  }, [identity, isLoading, hasFatalError, offers, datasets, financialQuery.data]);
  const previous = committed.current?.identity === identity ? committed.current : null;
  const presentedDatasets = isLoading && previous ? previous.datasets : datasets;
  const presentedFinancial = isLoading && previous ? previous.financial : financialQuery.data;

  const refresh = () => {
    if (scope === 'account') void dashboard.refetch();
    for (const query of detailQueries) void query.refetch();
  };

  const scopeDescription =
    scope === 'account'
      ? 'Todas as ofertas acessíveis, separadas por conta e moeda.'
      : 'A mesma leitura operacional, filtrada pela oferta ativa.';

  return (
    <DataPendingContext.Provider value={isLoading}>
      <div
        className="space-y-5"
        data-overview-dashboard
        data-overview-scope={scope}
        aria-busy={isLoading}
        data-overview-loading={isLoading || undefined}
      >
        <section
          data-overview-heading
          data-motion-panel
          className="glass-card animate-[tmx-reveal_220ms_cubic-bezier(0,0,0.2,1)_both] p-4 motion-reduce:animate-none sm:p-5"
        >
          <div className="flex flex-wrap items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-border bg-accent">
              <LayoutGrid aria-hidden className="h-4.5 w-4.5 text-primary" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground">Visão geral</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">{scopeDescription}</p>
            </div>
            <fieldset
              aria-label="Visão das vendas"
              className="ml-auto flex rounded-lg border bg-card p-1"
            >
              {(['general', 'natural'] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={salesView === view}
                  onClick={() => setSalesView(view)}
                  className={`rounded-md px-3 py-2 text-sm transition-colors ${salesView === view ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {view === 'general' ? 'Visão geral' : 'Visão natural'}
                </button>
              ))}
            </fieldset>
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

        {isLoading && !presentedDatasets.length ? (
          <output className="block min-h-[600px] pt-4 text-sm text-muted-foreground">
            Carregando dados…
          </output>
        ) : !isLoading && (hasFatalError || !hasCompleteOverviewScope(offers, datasets)) ? (
          <DataState
            variant="error"
            title="Não foi possível carregar a visão geral completa"
            description="Faltam dados de uma ou mais ofertas. Não exibiremos uma soma parcial como total. Os filtros foram preservados; tente novamente."
            isRetrying={isFetching}
            onRetry={refresh}
          />
        ) : !isLoading && offers.length === 0 ? (
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
            {SIGNAL_PREVIEW ? (
              <SignalPreview
                salesView={queryView}
                selected={selectedDataset}
                onSelect={setSelectedDataset}
                period={queryPeriod}
                datasets={presentedDatasets}
                accounts={scope === 'account' ? presentedFinancial?.accounts : undefined}
              />
            ) : (
              presentedDatasets.map((dataset) => (
                <Dataset key={dataset.key} dataset={dataset} salesView={queryView} />
              ))
            )}
            {!SIGNAL_PREVIEW && scope === 'account' && presentedFinancial?.accounts && (
              <GatewayOverview accounts={presentedFinancial.accounts} />
            )}
          </>
        )}
      </div>
    </DataPendingContext.Provider>
  );
}
