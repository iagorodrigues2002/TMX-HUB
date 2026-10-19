'use client';

import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import type { View } from './tracking-live-console-support';

export function useTrackingLiveConsoleState({
  offerId,
  mode,
  from,
  to,
}: {
  offerId: string;
  mode?: View;
  from: string;
  to: string;
}) {
  const [view, setView] = useState<View>('tracker');
  const activeView = mode ?? view;
  const [feed, setFeed] = useState<'sales' | 'events'>('sales');
  const [funnelDetail, setFunnelDetail] = useState<'overview' | 'pages' | 'journeys'>('overview');
  const [search, setSearch] = useState('');
  const period = { from, to };
  const summary = useQuery({
    queryKey: ['tracking-summary', offerId, from, to],
    queryFn: () => apiClient.getTrackingSummary(offerId, period),
    enabled: activeView !== 'attribution' && activeView !== 'infrastructure',
    refetchInterval: 30_000,
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const diagnostics = useQuery({
    queryKey: ['tracking-diagnostics', offerId],
    queryFn: () => apiClient.getTrackingDiagnostics(offerId),
    enabled: activeView === 'infrastructure',
    refetchInterval: 30_000,
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const events = useQuery({
    queryKey: ['tracking-events', offerId, from, to],
    queryFn: () => apiClient.listTrackingEvents(offerId, 1, 50, period),
    enabled: activeView === 'tracker',
    refetchInterval: 30_000,
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const orders = useQuery({
    queryKey: ['tracking-orders', offerId, from, to],
    queryFn: () => apiClient.listTrackingOrders(offerId, 1, 50, period),
    enabled: activeView === 'tracker',
    refetchInterval: 30_000,
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const deliveries = useQuery({
    queryKey: ['tracking-meta-deliveries', offerId],
    queryFn: () => apiClient.listMetaDeliveries(offerId),
    enabled: activeView === 'tracker',
    refetchInterval: 30_000,
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const pageFunnel = useQuery({
    queryKey: ['tracking-page-funnel', offerId, from, to],
    queryFn: () => apiClient.getTrackingPageFunnel(offerId, period),
    enabled: activeView === 'funnel',
    refetchInterval: 30_000,
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const journeys = useQuery({
    queryKey: ['tracking-journeys', offerId, from, to],
    queryFn: () => apiClient.listTrackingJourneys(offerId, period),
    enabled: activeView === 'funnel',
    refetchInterval: 30_000,
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const attribution = useQuery({
    queryKey: ['tracking-attribution', offerId, from, to],
    queryFn: () => apiClient.getTrackingAttribution(offerId, period),
    enabled: activeView === 'attribution',
    refetchInterval: 30_000,
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });
  const countries = useQuery({
    queryKey: ['tracking-countries', offerId, from, to],
    queryFn: () => apiClient.getTrackingCountries(offerId, period),
    enabled: activeView === 'tracker',
    refetchInterval: 30_000,
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('pt-BR');
    if (!term) return orders.data?.items ?? [];
    return (orders.data?.items ?? []).filter((order) => {
      const buyer = JSON.stringify(order.buyer).toLocaleLowerCase('pt-BR');
      return (
        order.external_id.toLocaleLowerCase('pt-BR').includes(term) ||
        (order.visitor_id ?? '').toLocaleLowerCase('pt-BR').includes(term) ||
        buyer.includes(term)
      );
    });
  }, [orders.data?.items, search]);

  const deliveredTransactions = new Set(
    (deliveries.data?.deliveries ?? [])
      .filter((delivery) => delivery.state === 'delivered')
      .map((delivery) => delivery.transaction_id),
  );
  const s = summary.data;
  const buyers = s?.paid_buyers ?? 0;
  return {
    mode,
    setView,
    activeView,
    feed,
    setFeed,
    funnelDetail,
    setFunnelDetail,
    search,
    setSearch,
    summary,
    diagnostics,
    events,
    orders,
    pageFunnel,
    journeys,
    attribution,
    countries,
    filteredOrders,
    deliveredTransactions,
    s,
    buyers,
  };
}
