'use client';

import { formatCurrency } from '@/components/dashboard/kpi-cards';
import {
  type IntradayAdView,
  type IntradayRangeSummaryView,
  type IntradaySummaryView,
  apiClient,
  canAccessOfferAi,
} from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { rollingDateRange, singleDayRange, todayIso } from '@/lib/date-range';
import { useQuery } from '@tanstack/react-query';
import { use, useMemo, useState } from 'react';

export function useOfertaDetailPageState({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { user } = useAuth();
  const canManage = user?.role === 'admin';
  const canUseAi = canAccessOfferAi(user);
  const [period, setPeriod] = useState(() => rollingDateRange(7));
  const { from, to } = period;
  const [editing, setEditing] = useState(false);
  const [adSearch, setAdSearch] = useState('');
  const [compareLeft, setCompareLeft] = useState('');
  const [compareRight, setCompareRight] = useState('');
  const [intradayMode, setIntradayMode] = useState<'overview' | 'ads'>('overview');
  const [intradayPeriod, setIntradayPeriod] = useState(() => singleDayRange(0));
  const { from: intradayFrom, to: intradayTo } = intradayPeriod;
  const [intradayAdWindow, setIntradayAdWindow] = useState('overall');
  const [intradayAdSearch, setIntradayAdSearch] = useState('');
  const [adCompareLeft, setAdCompareLeft] = useState('');
  const [adCompareRight, setAdCompareRight] = useState('');

  // Pull the offer (with links/status) from the offers list cache when possible.
  const offerQuery = useQuery({
    queryKey: ['offer-detail', id],
    queryFn: async () => {
      const all = await apiClient.listOffers();
      return all.find((o) => o.id === id) ?? null;
    },
  });
  const offer = offerQuery.data;

  const capabilitiesQuery = useQuery({
    queryKey: ['utmify-capabilities', id],
    queryFn: () => apiClient.getUtmifyCapabilities(id),
    enabled: Boolean(offer?.utmifyConfigured) && offer?.utmifyAccessEnabled !== false && canManage,
    staleTime: 30 * 60 * 1000,
    retry: false,
  });

  const snapshotsQuery = useQuery({
    queryKey: ['offer-snapshots', id, from, to],
    queryFn: () => apiClient.getOfferSnapshots(id, { from, to }),
    refetchOnWindowFocus: false,
  });
  const data = snapshotsQuery.data;

  const isIntradayRange = intradayFrom !== intradayTo;
  const intradayQuery = useQuery<IntradaySummaryView | IntradayRangeSummaryView>({
    queryKey: ['offer-intraday', id, intradayFrom, intradayTo],
    queryFn: () =>
      isIntradayRange
        ? apiClient.getOfferIntradayRange(id, intradayFrom, intradayTo)
        : apiClient.getOfferIntraday(id, intradayFrom),
    enabled: Boolean(offer?.utmifyConfigured),
    refetchInterval: !isIntradayRange && intradayFrom === todayIso() ? 60_000 : false,
    refetchOnWindowFocus: false,
  });
  const intraday = intradayQuery.data;

  const adsetTotals = useMemo(() => {
    if (!data)
      return [] as Array<{
        name: string;
        spend: number;
        sales: number;
        revenue: number;
        ic: number;
      }>;
    const map = new Map<
      string,
      { name: string; spend: number; sales: number; revenue: number; ic: number }
    >();
    for (const snap of data.snapshots) {
      for (const a of snap.adsets ?? []) {
        const existing = map.get(a.name);
        if (existing) {
          existing.spend += a.spend;
          existing.sales += a.sales;
          existing.revenue += a.revenue;
          existing.ic += a.ic;
        } else {
          map.set(a.name, {
            name: a.name,
            spend: a.spend,
            sales: a.sales,
            revenue: a.revenue,
            ic: a.ic,
          });
        }
      }
    }
    return Array.from(map.values()).sort((a, b) => b.revenue - a.revenue);
  }, [data]);

  const adTotals = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string;
        spend: number;
        sales: number;
        revenue: number;
        ic: number;
        impressions: number;
        clicks: number;
      }
    >();
    for (const snapshot of data?.snapshots ?? []) {
      for (const ad of snapshot.ads ?? []) {
        const current = map.get(ad.name) ?? {
          name: ad.name,
          spend: 0,
          sales: 0,
          revenue: 0,
          ic: 0,
          impressions: 0,
          clicks: 0,
        };
        current.spend += ad.spend;
        current.sales += ad.sales;
        current.revenue += ad.revenue;
        current.ic += ad.ic;
        current.impressions += ad.impressions ?? 0;
        current.clicks += ad.clicks ?? 0;
        map.set(ad.name, current);
      }
    }
    const query = adSearch.trim().toLocaleLowerCase('pt-BR');
    return [...map.values()]
      .filter((ad) => !query || ad.name.toLocaleLowerCase('pt-BR').includes(query))
      .sort((a, b) => b.revenue - a.revenue);
  }, [data, adSearch]);

  const offerName = offer?.name ?? data?.offer.name ?? id.slice(-6).toUpperCase();
  const currency = offer?.currency ?? data?.offer.currency ?? 'BRL';
  const money = (value: number | null | undefined) => formatCurrency(value, currency);
  const availableWindows = intraday?.windows.filter((window) => window.available) ?? [];
  const defaultLeft = availableWindows.at(-2)?.index ?? availableWindows.at(-1)?.index;
  const defaultRight = availableWindows.at(-1)?.index;
  const leftWindow = intraday?.windows.find(
    (window) => window.index === (compareLeft ? Number(compareLeft) : defaultLeft),
  );
  const rightWindow = intraday?.windows.find(
    (window) => window.index === (compareRight ? Number(compareRight) : defaultRight),
  );
  const currentWindow =
    !isIntradayRange && intraday && 'currentWindowIndex' in intraday
      ? intraday.windows.find(
          (window) =>
            window.index ===
            (intradayFrom === todayIso()
              ? intraday.currentWindowIndex
              : availableWindows.at(-1)?.index),
        )
      : undefined;
  const selectedAdWindow =
    intradayAdWindow === 'overall'
      ? undefined
      : intraday?.windows.find((window) => window.index === Number(intradayAdWindow));
  const intradayAds =
    intradayAdWindow === 'overall' ? (intraday?.overallAds ?? []) : (selectedAdWindow?.ads ?? []);
  const intradayAdQuery = intradayAdSearch.trim().toLocaleLowerCase('pt-BR');
  const filteredIntradayAds = intradayAds.filter(
    (ad) => !intradayAdQuery || ad.name.toLocaleLowerCase('pt-BR').includes(intradayAdQuery),
  );
  const availableAdWindows = intraday?.windows.filter((window) => window.adsAvailable) ?? [];
  const defaultAdLeft = availableAdWindows.at(-2)?.index;
  const defaultAdRight = availableAdWindows.at(-1)?.index;
  const leftAdWindow = intraday?.windows.find(
    (window) => window.index === (adCompareLeft ? Number(adCompareLeft) : defaultAdLeft),
  );
  const rightAdWindow = intraday?.windows.find(
    (window) => window.index === (adCompareRight ? Number(adCompareRight) : defaultAdRight),
  );
  const comparedAds = useMemo(() => {
    const byName = new Map<
      string,
      { name: string; left?: IntradayAdView; right?: IntradayAdView }
    >();
    for (const ad of leftAdWindow?.ads ?? []) byName.set(ad.name, { name: ad.name, left: ad });
    for (const ad of rightAdWindow?.ads ?? []) {
      const row = byName.get(ad.name) ?? { name: ad.name };
      row.right = ad;
      byName.set(ad.name, row);
    }
    return [...byName.values()]
      .filter(
        (row) => !intradayAdQuery || row.name.toLocaleLowerCase('pt-BR').includes(intradayAdQuery),
      )
      .sort((a, b) => (b.right?.revenue ?? 0) - (a.right?.revenue ?? 0));
  }, [leftAdWindow, rightAdWindow, intradayAdQuery]);
  return {
    id,
    canManage,
    canUseAi,
    period,
    setPeriod,
    from,
    to,
    editing,
    setEditing,
    adSearch,
    setAdSearch,
    compareLeft,
    setCompareLeft,
    compareRight,
    setCompareRight,
    intradayMode,
    setIntradayMode,
    setIntradayPeriod,
    intradayFrom,
    intradayTo,
    intradayAdWindow,
    setIntradayAdWindow,
    intradayAdSearch,
    setIntradayAdSearch,
    adCompareLeft,
    setAdCompareLeft,
    adCompareRight,
    setAdCompareRight,
    offerQuery,
    offer,
    capabilitiesQuery,
    snapshotsQuery,
    data,
    isIntradayRange,
    intradayQuery,
    intraday,
    adsetTotals,
    adTotals,
    offerName,
    currency,
    money,
    availableWindows,
    leftWindow,
    rightWindow,
    currentWindow,
    selectedAdWindow,
    filteredIntradayAds,
    availableAdWindows,
    leftAdWindow,
    rightAdWindow,
    comparedAds,
  };
}
