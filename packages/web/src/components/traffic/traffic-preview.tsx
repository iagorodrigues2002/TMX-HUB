'use client';
import { Button } from '@/components/ui/button';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useAuth } from '@/lib/auth-context';
import { CREATIVE_HISTORY_START } from '@/lib/creative-identity';
import { creativeWorkspaceEnabled } from '@/lib/creative-workspace-release';
import { DASHBOARD_DATE_PRESETS, type DateRange, singleDayRange, todayIso } from '@/lib/date-range';
import { useRouter } from '@/lib/motion-router';
import { hasNavigationAccess } from '@page-cloner/shared';
import { useSearchParams } from 'next/navigation';
import { useLayoutEffect, useRef, useState } from 'react';
import { ContingencyPreview } from './contingency-preview';
import { CreativeWorkspace } from './creative-workspace';
import { RealCampaigns, type TrafficFilters } from './real-campaigns';
import { TrafficFilterSelect } from './traffic-filter-select';
import { assignedOffer } from './real-campaigns-model';
import { type TrafficTab, availableTrafficTabs, selectTrafficTab } from './traffic-model';
import styles from './traffic-preview.module.css';
import { TrafficSettings } from './traffic-settings';
import { useLiveTraffic } from './use-live-traffic';
import { useTrafficInventory } from './use-traffic-inventory';

export function TrafficPreview() {
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const allowedTabs = availableTrafficTabs(creativeWorkspaceEnabled).filter(
    ([id]) =>
      user?.role === 'admin' ||
      (id !== 'ads-intelligence' && hasNavigationAccess(user?.allowedTools, `traffic-${id}`)),
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
    offer: params.get('offer') ?? '',
    account: '',
    business: '',
    status: '',
    query: '',
  });
  const reporting = allowedTabs.length > 0 && ['overview', 'campaigns', 'windows'].includes(tab);
  const [creativeRange, setCreativeRange] = useState<DateRange>(() => ({
    from: CREATIVE_HISTORY_START,
    to: todayIso(),
  }));
  const live = useLiveTraffic(
    tab === 'ads-intelligence' ? creativeRange : range,
    tab === 'windows' || tab === 'campaigns',
    reporting || tab === 'ads-intelligence',
    tab !== 'ads-intelligence',
    tab === 'ads-intelligence',
  );
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
      {tab === 'ads-intelligence' && <h1 className="sr-only">Ads Intelligence · Tráfego</h1>}
      {tab !== 'ads-intelligence' && (
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
      )}
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
          <TabsContent value={tab}>
            <RealCampaigns
              range={range}
              view={tab === 'ads-intelligence' ? 'overview' : tab}
              live={live}
              filters={filters}
              setFilters={setFilters}
              codes={codes}
              filterPanel={
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
                <TrafficFilterSelect
                  label="Oferta do tráfego"
                  value={filters.offer}
                  onChange={(value) => setFilters({ ...filters, offer: value })}
                  options={[{ value: '', label: 'Todas as ofertas' }, ...codes.map(code => ({ value: code, label: code })), { value: '__unclassified', label: 'Não classificado' }]}
                />
              </label>
              <label className={styles.field}>
                Exibir valores em
                <TrafficFilterSelect
                  label="Moeda de exibição do tráfego"
                  value={filters.currency}
                  onChange={(value) =>
                    setFilters({ ...filters, currency: value as 'BRL' | 'USD' })
                  }
                  options={[{ value: 'BRL', label: 'Real · R$' }, { value: 'USD', label: 'Dólar · US$' }]}
                />
              </label>
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  setFilters({
                    ...filters,
                    offer: '',
                    account: '',
                    accountStatus: '',
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
              }
            />
          </TabsContent>
        )}
        {allowedTabs.some(([id]) => id === 'ads-intelligence') && (
          <TabsContent value="ads-intelligence">
            <CreativeWorkspace
              dateFilter={
                <DateRangeFilter
                  value={creativeRange}
                  onChange={setCreativeRange}
                  presets={DASHBOARD_DATE_PRESETS.filter(
                    (preset) => preset.id !== 'previous-month',
                  ).map((preset) =>
                    preset.id === 'all-time'
                      ? {
                          ...preset,
                          getRange: () => ({ from: CREATIVE_HISTORY_START, to: todayIso() }),
                        }
                      : preset,
                  )}
                  max={todayIso()}
                  className={styles.dateWorkbench}
                  status={
                    <span className={styles.subtle}>
                      Métricas do período selecionado · período total desde {CREATIVE_HISTORY_START}
                    </span>
                  }
                />
              }
              live={live}
              range={creativeRange}
              currency={filters.currency}
              setCurrency={(currency) => setFilters((value) => ({ ...value, currency }))}
              offer={filters.offer === '__unclassified' ? 'Sem oferta' : filters.offer}
              selectOffer={(offer) => {
                const code = offer === 'Sem oferta' ? '__unclassified' : offer;
                setFilters((value) => ({ ...value, offer: code }));
                const next = new URLSearchParams(params);
                if (code) next.set('offer', code);
                else next.delete('offer');
                router.replace(`/trafego?${next}`, { scroll: false });
              }}
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
