'use client';
import { Button } from '@/components/ui/button';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth-context';
import { DASHBOARD_DATE_PRESETS, type DateRange, singleDayRange, todayIso } from '@/lib/date-range';
import { useRouter } from '@/lib/motion-router';
import { hasNavigationAccess } from '@page-cloner/shared';
import { useSearchParams } from 'next/navigation';
import { useLayoutEffect, useRef, useState } from 'react';
import { ContingencyPreview } from './contingency-preview';
import { RealCampaigns, type TrafficFilters } from './real-campaigns';
import { assignedOffer } from './real-campaigns-model';
import { type TrafficTab, selectTrafficTab, trafficTabs } from './traffic-model';
import styles from './traffic-preview.module.css';
import { TrafficSettings } from './traffic-settings';
import { useLiveTraffic } from './use-live-traffic';
import { useTrafficInventory } from './use-traffic-inventory';

export function TrafficPreview() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const allowedTabs = trafficTabs.filter(
    ([id]) => user?.role === 'admin' || hasNavigationAccess(user?.allowedTools, `traffic-${id}`),
  );
  const tab =
    selectTrafficTab(
      params.get('view'),
      allowedTabs.map(([id]) => id),
    ) ?? 'overview';
  const tabList = useRef<HTMLDivElement>(null);
  const tabLayout = allowedTabs.map(([id]) => id).join(',');
  const [pill, setPill] = useState<{
    left: number;
    top: number;
    width: number;
    height: number;
  } | null>(null);
  useLayoutEffect(() => {
    const list = tabList.current;
    if (!list || !tabLayout) {
      setPill(null);
      return;
    }
    const measure = () => {
      const active = list.querySelector<HTMLElement>(
        `[role="tab"][data-state="active"][data-traffic-tab="${tab}"]`,
      );
      if (active)
        setPill({
          left: active.offsetLeft,
          top: active.offsetTop,
          width: active.offsetWidth,
          height: active.offsetHeight,
        });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => observer.disconnect();
  }, [tab, tabLayout]);
  const [range, setRange] = useState<DateRange>(() => singleDayRange(0));
  const [filters, setFilters] = useState<TrafficFilters>({
    currency: 'BRL',
    offer: '',
    account: '',
    business: '',
    status: '',
    query: '',
  });
  const reporting = allowedTabs.length > 0 && ['overview', 'campaigns', 'windows'].includes(tab);
  const live = useLiveTraffic(range, tab === 'windows', reporting);
  const assets = useTrafficInventory(
    allowedTabs.some(([id]) => id === 'contingency' || id === 'settings'),
  );
  const codes = [
    ...new Set(
      [
        ...(live.data.data?.campaigns.map((c) => assignedOffer(c, live.mappings)) ?? []),
        ...Object.values(live.mappings),
        ...(filters.offer && filters.offer !== '__unclassified' ? [filters.offer] : []),
      ].filter(Boolean),
    ),
  ].sort();
  const navigate = (view: TrafficTab) => {
    const next = new URLSearchParams(params);
    next.set('view', view);
    router.replace(`/trafego?${next}`, { scroll: false });
  };
  return (
    <section className={styles.root}>
      <header className={styles.workspaceHeader}>
        <div>
          <p className={styles.eyebrow}>TMX / Operação</p>
          <h1>Tráfego</h1>
        </div>
        <span className={styles.localBadge}>
          {live.status.data?.blocked
            ? 'Acesso à API da Meta bloqueado'
            : live.status.data?.connected
              ? live.personal || live.service.data?.running
                ? 'System User conectado · atualização automática'
                : 'System User conectado · serviço local'
              : 'Última consulta da Meta'}{' '}
          {process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic' ? '· prévia local' : ''}
        </span>
      </header>
      <Tabs value={tab} onValueChange={(value) => navigate(value as TrafficTab)}>
        <TabsList
          ref={tabList}
          className={styles.mainTabs}
          data-moving-pill={pill ? 'true' : undefined}
          aria-label="Seções de Tráfego"
        >
          {pill && (
            <span
              aria-hidden
              className={styles.tabPill}
              style={{
                width: pill.width,
                height: pill.height,
                transform: `translate(${pill.left}px,${pill.top}px)`,
              }}
            />
          )}
          {allowedTabs.map(([id, label]) => (
            <TabsTrigger value={id} key={id} data-traffic-tab={id}>
              {label}
            </TabsTrigger>
          ))}
        </TabsList>
        {reporting && (
          <section
            className={styles.filterWorkbench}
            aria-label="Filtros compartilhados do tráfego"
          >
            <div className={styles.filterHeading}>
              <span>Filtros do tráfego</span>
            </div>
            <div className={styles.compactSources}>
              <label className={styles.field}>
                Oferta
                <select
                  aria-label="Oferta do tráfego"
                  className={styles.control}
                  value={filters.offer}
                  onChange={(event) => setFilters({ ...filters, offer: event.target.value })}
                >
                  <option value="">Todas as ofertas</option>
                  {codes.map((code) => (
                    <option key={code}>{code}</option>
                  ))}
                  <option value="__unclassified">Não classificado</option>
                </select>
              </label>
              <label className={styles.field}>
                Exibir valores em
                <select
                  aria-label="Moeda de exibição do tráfego"
                  className={styles.control}
                  value={filters.currency}
                  onChange={(event) =>
                    setFilters({ ...filters, currency: event.target.value as 'BRL' | 'USD' })
                  }
                >
                  <option value="BRL">Real · R$</option>
                  <option value="USD">Dólar · US$</option>
                </select>
              </label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setFilters({
                    ...filters,
                    offer: '',
                    account: '',
                    business: '',
                    status: '',
                    query: '',
                  })
                }
              >
                Limpar filtros
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={
                  (!live.personal && !live.status.data?.connected) ||
                  live.status.data?.busy ||
                  live.refresh.isPending
                }
                onClick={() => live.refresh.mutate()}
              >
                {live.status.data?.busy ? 'Consultando Meta…' : 'Atualizar da Meta'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={live.finance.isFetching}
                onClick={() => void live.finance.refetch()}
              >
                {live.finance.isFetching ? 'Consultando TMX…' : 'Atualizar financeiro TMX'}
              </Button>
            </div>
            <DateRangeFilter
              value={range}
              onChange={setRange}
              presets={DASHBOARD_DATE_PRESETS}
              max={todayIso()}
              className={styles.dateWorkbench}
              status={
                <span className={styles.subtle}>Datas e horas no fuso de cada conta Meta</span>
              }
            />
          </section>
        )}
        {reporting && (
          <TabsContent value={tab}>
            <RealCampaigns
              range={range}
              view={tab}
              live={live}
              filters={filters}
              setFilters={setFilters}
              codes={codes}
            />
          </TabsContent>
        )}
        {allowedTabs.some(([id]) => id === 'contingency') && (
          <TabsContent value="contingency">
            <ContingencyPreview assets={assets} onSettings={() => navigate('settings')} />
          </TabsContent>
        )}
        {allowedTabs.some(([id]) => id === 'settings') && (
          <TabsContent value="settings">
            <TrafficSettings assets={assets} live={live} />
          </TabsContent>
        )}
      </Tabs>
    </section>
  );
}
