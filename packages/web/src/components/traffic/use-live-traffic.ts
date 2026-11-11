'use client';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import type { DateRange } from '@/lib/date-range';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import type { NativeFinanceOffer, RealCampaignSnapshot } from './real-campaigns-model';

export function useLiveTraffic(
  range: DateRange,
  hourly = false,
  reporting = true,
  financial = true,
  requireCompleteReport = false,
) {
  const { user } = useAuth();
  const client = useQueryClient();
  const attempted = useRef('');
  const connection = useQuery({
    queryKey: ['traffic-user-connection', user?.id, requireCompleteReport],
    queryFn: () =>
      request<{ connected: boolean; id?: string; name?: string; busy?: boolean; error?: string; shared?: boolean }>(
        '/v1/meta-control/traffic/connection' + (requireCompleteReport ? '?workspace=creative' : ''),
      ),
    enabled: !!user,
    retry: false,
    refetchInterval: 3000,
  });
  const personal = connection.data?.connected === true;
  const legacy =
    !personal &&
    user?.id === 'admin' &&
    process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic';
  const reportPath = personal
    ? '/v1/meta-control/traffic/connection/report'
    : '/v1/meta-control/campaigns/local-import';
  const service = useQuery({
    queryKey: ['traffic-background-service', user?.id],
    queryFn: () =>
      request<{
        running: boolean;
        automatic: boolean;
        busy?: boolean;
        todayIntervalMs?: number;
        yesterdayIntervalMs?: number;
        periods?: Record<
          string,
          { date: string; metaAt: string | null; financeAt: string | null; error: string }
        >;
        error?: string;
      }>('/v1/meta-control/traffic/service'),
    enabled: legacy,
    retry: false,
    refetchInterval: 15000,
  });
  const financeUpdate = Object.values(service.data?.periods ?? {}).find(
    (period) => period.date === range.from && period.date === range.to,
  )?.financeAt;
  useEffect(() => {
    if (financeUpdate)
      void client.invalidateQueries({
        queryKey: ['traffic-real-finance', user?.id, range.from, range.to],
      });
  }, [financeUpdate, client, user?.id, range.from, range.to]);
  const data = useQuery({
    queryKey: [
      'traffic-real-campaigns',
      user?.id,
      range.from,
      range.to,
      connection.data?.id ?? 'legacy',
      hourly,
      requireCompleteReport,
    ],
    queryFn: async ({ signal }) => {
      const report = await request<RealCampaignSnapshot>(
        `${reportPath}?${new URLSearchParams({
          from: range.from,
          to: range.to,
          hourly: hourly ? '1' : '0',
          ...(requireCompleteReport ? { workspace: 'creative' } : {}),
        })}`,
        { signal },
      );
      if (requireCompleteReport && (report.from > range.from || report.to < range.to))
        throw Error('A consulta ainda não cobre o período completo.');
      return report;
    },
    enabled: reporting && (legacy || personal) && (!requireCompleteReport || connection.isFetched),
    retry: false,
    staleTime: 60000,
    refetchInterval: (query) =>
      personal ? (connection.data?.busy && !query.state.data ? 3000 : 60000) : false,
  });
  const status = useQuery({
    queryKey: ['traffic-meta-session', user?.id],
    queryFn: () =>
      request<{
        connected: boolean;
        source?: 'local' | 'server';
        blocked?: boolean;
        busy: boolean;
        from?: string;
        to?: string;
        updatedAt?: string;
        error?: string;
      }>('/v1/meta-control/traffic/status'),
    enabled: legacy,
    retry: false,
    refetchInterval: (query) => (query.state.data?.busy ? 2000 : 15000),
  });
  const refresh = useMutation({
    mutationFn: () =>
      request(
        personal
          ? '/v1/meta-control/traffic/connection/refresh'
          : '/v1/meta-control/traffic/refresh',
        { method: 'POST', body: range },
      ),
    onMutate: () => {
      void client.invalidateQueries({
        queryKey: ['traffic-attribution', user?.id, range.from, range.to],
      });
      void client.invalidateQueries({
        queryKey: ['traffic-real-finance', user?.id, range.from, range.to],
      });
    },
    onSuccess: () => {
      void data.refetch();
      void status.refetch();
    },
  });
  useEffect(() => {
    if (personal && !connection.data?.busy) {
      void client.invalidateQueries({ queryKey: ['traffic-real-campaigns', user?.id] });
      void client.invalidateQueries({ queryKey: ['traffic-local-inventory', user?.id] });
    }
  }, [personal, connection.data?.busy, client, user?.id]);
  useEffect(() => {
    if (status.data?.updatedAt && !status.data.busy) {
      void client.invalidateQueries({ queryKey: ['traffic-real-campaigns', user?.id] });
      void client.invalidateQueries({ queryKey: ['traffic-local-inventory', user?.id] });
      if (status.data.source === 'server')
        void client.invalidateQueries({ queryKey: ['traffic-real-finance', user?.id] });
    }
  }, [status.data?.updatedAt, status.data?.busy, status.data?.source, client, user?.id]);
  useEffect(() => {
    const key = `${range.from}:${range.to}`;
    if (
      status.data?.connected &&
      !connection.data?.shared &&
      !data.isPending &&
      !status.data.busy &&
      !refresh.isPending &&
      (data.data?.from !== range.from || data.data?.to !== range.to) &&
      attempted.current !== key
    ) {
      attempted.current = key;
      refresh.mutate();
    }
  }, [
    range.from,
    range.to,
    status.data?.connected,
    connection.data?.shared,
    status.data?.busy,
    data.data?.from,
    data.data?.to,
    data.isPending,
    refresh.isPending,
    refresh.mutate,
  ]);
  const finance = useQuery({
    queryKey: ['traffic-real-finance', user?.id, range.from, range.to, personal],
    queryFn: async ({ signal }) => {
      if (!legacy) {
        const [natural, general] = await Promise.all(
          ['natural', 'general'].map((sales_view) =>
            request<{ from: string; to: string; offers: NativeFinanceOffer[] }>(
              `/v1/meta-control/traffic/finance-overview?${new URLSearchParams({ ...range, sales_view })}`,
              { signal },
            ),
          ),
        );
        if (
          !natural ||
          !general ||
          natural.from !== range.from ||
          natural.to !== range.to ||
          general.from !== range.from ||
          general.to !== range.to
        )
          throw Error('Período financeiro inválido.');
        return {
          source: 'https://theminex.com',
          authorizedOffers: true as const,
          ownerId: user!.id,
          ownerName: user!.name,
          from: range.from,
          to: range.to,
          fetchedAt: new Date().toISOString(),
          natural: { offers: natural.offers },
          general: { offers: general.offers },
        };
      }
      const result = await request<{
        source: string;
        ownerId: string;
        ownerName: string;
        fetchedAt: string;
        from: string;
        to: string;
        natural: { offers: NativeFinanceOffer[] };
        general: { offers: NativeFinanceOffer[] };
      }>(
        `/v1/meta-control/traffic/finance?${new URLSearchParams({ from: range.from, to: range.to })}`,
        { signal },
      );
      return { ...result, authorizedOffers: false as const };
    },
    enabled: financial && reporting && (legacy || personal),
    retry: false,
    staleTime: 60000,
  });
  const metaAt = data.data?.fetchedAt;
  const financeAt = finance.data?.fetchedAt;
  useEffect(() => {
    if (!metaAt && !financeAt) return;
    void client.invalidateQueries({
      queryKey: ['traffic-attribution', user?.id, range.from, range.to],
    });
  }, [metaAt, financeAt, client, user?.id, range.from, range.to]);
  const [saved, setSaved] = useState<{
    userId: string;
    campaigns: Record<string, string>;
    links: Record<string, string>;
  }>({ userId: '', campaigns: {}, links: {} });
  useEffect(() => {
    if (!user?.id) return;
    let campaigns: Record<string, string> = {};
    let links: Record<string, string> = {};
    try {
      const raw = JSON.parse(localStorage.getItem(`tmx:traffic-classification:${user.id}`) ?? '{}');
      const valid = (value: unknown) =>
        value &&
        typeof value === 'object' &&
        !Array.isArray(value) &&
        Object.entries(value).every(
          ([key, item]) => key.length < 128 && typeof item === 'string' && item.length < 100,
        );
      if (valid(raw.campaigns)) campaigns = raw.campaigns;
      if (valid(raw.links)) links = raw.links;
    } catch {}
    setSaved({ userId: user.id, campaigns, links });
  }, [user?.id]);
  const mappings = saved.userId === user?.id ? saved.campaigns : {};
  const links = saved.userId === user?.id ? saved.links : {};
  function saveClassification(kind: 'campaigns' | 'links', id: string, value: string) {
    if (!user?.id) return;
    const entries = { ...(kind === 'campaigns' ? mappings : links) };
    if (value === '__auto') delete entries[id];
    else entries[id] = value;
    const next = {
      userId: user.id,
      campaigns: mappings,
      links,
      ...{ [kind]: entries },
    };
    setSaved(next);
    try {
      localStorage.setItem(
        `tmx:traffic-classification:${user.id}`,
        JSON.stringify({ campaigns: next.campaigns, links: next.links }),
      );
    } catch {
      /* Current-session changes remain usable if storage is unavailable. */
    }
  }
  const offers =
    finance.data?.general.offers.map((offer) => ({ id: offer.offer_id, name: offer.offer_name })) ??
    [];
  return {
    connection,
    personal,
    service,
    data,
    status: personal
      ? {
          ...status,
          data: {
            connected: true,
            blocked: false,
            source: 'local' as const,
            busy: connection.data?.busy ?? false,
            from: data.data?.from,
            to: data.data?.to,
            updatedAt: data.data?.fetchedAt,
            error: connection.data?.error,
          },
        }
      : status,
    refresh,
    finance,
    natural: { data: finance.data?.natural },
    general: { data: finance.data?.general },
    offers,
    mappings,
    links,
    saveClassification,
    userId: finance.data?.ownerId,
  };
}

export type LiveTraffic = ReturnType<typeof useLiveTraffic>;
