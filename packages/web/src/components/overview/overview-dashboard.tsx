'use client';

import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { DataState } from '@/components/ui/data-state';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { apiClient } from '@/lib/api-client';
import {
  DASHBOARD_DATE_PRESETS,
  type DateRange,
  rollingDateRange,
  todayIso,
} from '@/lib/date-range';
import { useQueries, useQuery } from '@tanstack/react-query';
import { LayoutDashboard } from 'lucide-react';
import { useState } from 'react';
import { GatewayOverview } from './gateway-overview';
import { buildDatasets } from './overview-dashboard-build-datasets';
import { Dataset } from './overview-dashboard-dataset';
import {
  type OfferDescriptor,
  type OverviewDashboardProps,
  OverviewLoadingSkeleton,
  accountOffers,
} from './overview-dashboard-support';
import { SIGNAL_PREVIEW, SignalPreview } from './signal-preview';

export function OverviewDashboard(props: OverviewDashboardProps) {
  const { scope, initialPeriod } = props;
  const [period, setPeriod] = useState<DateRange>(() => initialPeriod ?? rollingDateRange(7));
  const financialQuery = useQuery({
    queryKey: ['overview-financial', period.from, period.to],
    queryFn: () => apiClient.getTrackingOverview(period.from, period.to),
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
    retry: false,
  });
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
    financialQuery.data?.offers,
  );
  const detailQueries = [
    ...snapshotQueries,
    ...trackingQueries,
    ...intradayQueries,
    financialQuery,
  ];
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
      <section className="animate-[tmx-reveal_220ms_cubic-bezier(0,0,0.2,1)_both] rounded-lg border border-white/[0.08] bg-white/[0.025] p-4 motion-reduce:animate-none sm:p-5">
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
        <OverviewLoadingSkeleton />
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
          {SIGNAL_PREVIEW ? (
            <SignalPreview
              period={period}
              datasets={datasets}
              accounts={scope === 'account' ? financialQuery.data?.accounts : undefined}
            />
          ) : (
            datasets.map((dataset) => <Dataset key={dataset.key} dataset={dataset} />)
          )}
          {!SIGNAL_PREVIEW && scope === 'account' && financialQuery.data?.accounts && (
            <GatewayOverview accounts={financialQuery.data.accounts} />
          )}
        </>
      )}
    </div>
  );
}
