'use client';

import { TrackingCountryMap } from '@/components/tracking/tracking-country-map';
import { Button } from '@/components/ui/button';
import { apiClient } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  CheckCircle2,
  Database,
  Filter,
  Loader2,
  Megaphone,
  RadioTower,
  Search,
  ShoppingCart,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';

type View = 'tracker' | 'funnel' | 'attribution' | 'infrastructure';

function money(minor: string | number | undefined, currency = 'BRL') {
  const value = Number(minor ?? 0) / 100;
  const normalizedCurrency = /^[A-Z]{3}$/.test(currency.trim().toUpperCase())
    ? currency.trim().toUpperCase()
    : 'BRL';

  try {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: normalizedCurrency,
    }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(Number.isFinite(value) ? value : 0);
  }
}

function percentage(value: number, total: number) {
  if (!total) return '0%';
  return `${((value / total) * 100).toFixed(1).replace('.', ',')}%`;
}

function shortId(value?: string) {
  if (!value) return 'sem indexador';
  return value.length > 16 ? `${value.slice(0, 8)}…${value.slice(-5)}` : value;
}

export function TrackingLiveConsole({
  offerId,
  mode,
  date,
}: {
  offerId: string;
  mode?: View;
  date: string;
}) {
  const [view, setView] = useState<View>('tracker');
  const activeView = mode ?? view;
  const [feed, setFeed] = useState<'sales' | 'events'>('sales');
  const [funnelDetail, setFunnelDetail] = useState<'overview' | 'pages' | 'journeys'>('overview');
  const [search, setSearch] = useState('');
  const summary = useQuery({
    queryKey: ['tracking-summary', offerId, date],
    queryFn: () => apiClient.getTrackingSummary(offerId, date),
    refetchInterval: 30_000,
    retry: false,
  });
  const diagnostics = useQuery({
    queryKey: ['tracking-diagnostics', offerId],
    queryFn: () => apiClient.getTrackingDiagnostics(offerId),
    refetchInterval: 30_000,
    retry: false,
  });
  const events = useQuery({
    queryKey: ['tracking-events', offerId, date],
    queryFn: () => apiClient.listTrackingEvents(offerId, 1, 50, date),
    refetchInterval: 30_000,
    retry: false,
  });
  const orders = useQuery({
    queryKey: ['tracking-orders', offerId, date],
    queryFn: () => apiClient.listTrackingOrders(offerId, 1, 50, date),
    refetchInterval: 30_000,
    retry: false,
  });
  const deliveries = useQuery({
    queryKey: ['tracking-meta-deliveries', offerId],
    queryFn: () => apiClient.listMetaDeliveries(offerId),
    refetchInterval: 30_000,
    retry: false,
  });
  const pageFunnel = useQuery({
    queryKey: ['tracking-page-funnel', offerId, date],
    queryFn: () => apiClient.getTrackingPageFunnel(offerId, date),
    enabled: activeView === 'funnel',
    refetchInterval: 30_000,
    retry: false,
  });
  const journeys = useQuery({
    queryKey: ['tracking-journeys', offerId, date],
    queryFn: () => apiClient.listTrackingJourneys(offerId, date),
    enabled: activeView === 'funnel',
    refetchInterval: 30_000,
    retry: false,
  });
  const attribution = useQuery({
    queryKey: ['tracking-attribution', offerId, date],
    queryFn: () => apiClient.getTrackingAttribution(offerId, date),
    enabled: activeView === 'attribution',
    refetchInterval: 30_000,
    retry: false,
  });
  const countries = useQuery({
    queryKey: ['tracking-countries', offerId, date],
    queryFn: () => apiClient.getTrackingCountries(offerId, date),
    enabled: activeView === 'tracker',
    refetchInterval: 30_000,
    retry: false,
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

  return (
    <section className="overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]">
      {!mode && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] p-3">
          <div className="flex flex-wrap gap-1">
            {[
              { id: 'tracker' as const, label: 'Tracker', icon: RadioTower },
              { id: 'funnel' as const, label: 'Funil', icon: Filter },
              { id: 'attribution' as const, label: 'Campanhas', icon: Megaphone },
              { id: 'infrastructure' as const, label: 'Saúde automática', icon: Database },
            ].map(({ id, label, icon: Icon }) => (
              <Button
                key={id}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setView(id)}
                className={cn(
                  'gap-2 text-white/45',
                  activeView === id && 'bg-emerald-300/[0.09] text-emerald-200',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Button>
            ))}
          </div>
          <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-emerald-200/70">
            <span className="status-dot" aria-hidden /> atualização automática · 30s
          </p>
        </div>
      )}

      {summary.isLoading ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-white/45">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando sinais…
        </div>
      ) : activeView === 'infrastructure' ? (
        <div className="p-5 md:p-6">
          <div className="mb-5">
            <p className="hud-label">Infraestrutura gerenciada</p>
            <h3 className="mt-2 text-xl font-semibold text-white">
              Nenhum acesso ao Railway é necessário
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
              O TMXHUB monitora banco, migrations e criptografia e aplica atualizações antes de
              iniciar a API.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[
              ['PostgreSQL', diagnostics.data?.database],
              ['Estrutura do banco', diagnostics.data?.migrations],
              ['Criptografia', diagnostics.data?.encryption],
            ].map(([label, status]) => {
              const ready = status === 'ready';
              return (
                <div
                  key={label}
                  className={cn(
                    'rounded-md border p-4',
                    ready
                      ? 'border-emerald-300/15 bg-emerald-300/[0.035]'
                      : 'border-amber-300/15 bg-amber-300/[0.035]',
                  )}
                >
                  {ready ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
                  )}
                  <p className="mt-3 text-sm font-medium text-white/75">{label}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-white/35">
                    {ready ? 'operacional' : 'atualizando automaticamente'}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-md border border-white/[0.07] bg-black/10 p-4 text-xs leading-5 text-white/45">
            {diagnostics.data?.detail ??
              'O diagnóstico será exibido assim que o tracking da oferta for criado.'}
          </div>
          <div className="mt-5">
            <p className="hud-label">Entrega para UTMify</p>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                [
                  'Destino configurado',
                  diagnostics.data?.utmify.destination_configured ? 'sim' : 'não',
                ],
                ['Worker no ar', diagnostics.data?.utmify.worker_running ? 'sim' : 'não'],
                [
                  'Pendentes / falhas / mortas',
                  `${diagnostics.data?.utmify.pending ?? 0} / ${diagnostics.data?.utmify.failed ?? 0} / ${diagnostics.data?.utmify.dead ?? 0}`,
                ],
                ['Entregues', diagnostics.data?.utmify.delivered ?? 0],
              ].map(([label, value]) => (
                <div key={label} className="rounded-md border border-white/[0.07] bg-black/10 p-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/35">{label}</p>
                  <p className="mt-1 font-mono text-sm text-white">{value}</p>
                </div>
              ))}
            </div>
            {diagnostics.data?.utmify.hint && (
              <div className="mt-3 rounded-md border border-amber-300/20 bg-amber-300/[0.04] p-4 text-xs leading-5 text-amber-100/80">
                {diagnostics.data.utmify.hint}
              </div>
            )}
            {diagnostics.data?.utmify.last_error && (
              <div className="mt-2 rounded-md border border-red-300/20 bg-red-300/[0.04] p-4 text-xs leading-5 text-red-200/70">
                Último erro: {diagnostics.data.utmify.last_error}
              </div>
            )}
          </div>
        </div>
      ) : activeView === 'attribution' ? (
        <div className="p-5 md:p-6">
          <div className="mb-5">
            <p className="hud-label">Atribuição completa · first-party</p>
            <h3 className="mt-2 text-xl font-semibold text-white">Campanhas e anúncios</h3>
            <p className="mt-2 text-sm text-white/45">
              Visitas, checkouts e vendas agrupados pelas UTMs e IDs preservados pelo TMX.
            </p>
          </div>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              {
                label: 'Campanhas',
                value: new Set(
                  (attribution.data?.rows ?? [])
                    .map((row) => row.campaign_id ?? row.campaign_name)
                    .filter((value) => value !== 'não identificada'),
                ).size,
              },
              {
                label: 'Cliques TMX',
                value: (attribution.data?.rows ?? []).reduce(
                  (total, row) => total + row.unique_ad_clicks,
                  0,
                ),
              },
              {
                label: 'Conectados',
                value: (attribution.data?.rows ?? []).reduce(
                  (total, row) => total + row.visitors,
                  0,
                ),
              },
              {
                label: 'ICs únicos',
                value: (attribution.data?.rows ?? []).reduce(
                  (total, row) => total + row.unique_checkouts,
                  0,
                ),
              },
              {
                label: 'Vendas',
                value: (attribution.data?.rows ?? []).reduce(
                  (total, row) => total + row.paid_orders,
                  0,
                ),
              },
            ].map((metric) => (
              <div
                key={metric.label}
                className="rounded-lg border border-white/[0.07] bg-black/10 px-4 py-3"
              >
                <p className="hud-label">{metric.label}</p>
                <p className="mt-2 font-mono text-2xl text-white">
                  {metric.value.toLocaleString('pt-BR')}
                </p>
              </div>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/[0.08]">
            <table className="min-w-[1280px] w-full text-left text-xs">
              <thead className="border-b border-white/[0.08] bg-black/20 text-white/35">
                <tr>
                  {[
                    'Campanha',
                    'Conjunto',
                    'Anúncio',
                    'Origem',
                    'Cliques',
                    'Visitas',
                    'Connect Rate',
                    'IC',
                    'Conv. IC',
                    'Pedidos',
                    'Vendas',
                    'Receita',
                  ].map((label) => (
                    <th key={label} className="px-4 py-3 font-medium uppercase tracking-wider">
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {(attribution.data?.rows ?? []).map((row, index) => (
                  <tr
                    key={`${row.campaign_id ?? row.campaign_name}-${row.ad_id ?? row.ad_name}-${index}`}
                    className="bg-black/5"
                  >
                    <td className="px-4 py-3">
                      <p className="font-medium text-white/80">{row.campaign_name}</p>
                      <p className="mt-1 font-mono text-[10px] text-white/30">
                        {row.campaign_id ?? 'sem campaign_id'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white/65">{row.adset_name}</p>
                      <p className="mt-1 font-mono text-[10px] text-white/30">
                        {row.adset_id ?? 'sem adset_id'}
                      </p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white/65">{row.ad_name}</p>
                      <p className="mt-1 font-mono text-[10px] text-white/30">
                        {row.ad_id ?? 'sem ad_id'} · {row.placement}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-white/55">{row.source}</td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-white">{row.unique_ad_clicks}</p>
                      <p className="mt-1 text-[10px] text-white/30">{row.ad_clicks} totais</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-white">{row.visitors}</p>
                      <p className="mt-1 text-[10px] text-white/30">{row.page_views} pageviews</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-emerald-200">
                      {percentage(row.visitors, row.unique_ad_clicks)}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-mono text-cyan-200">{row.unique_checkouts}</p>
                      <p className="mt-1 text-[10px] text-white/30">{row.checkouts} disparos</p>
                    </td>
                    <td className="px-4 py-3 font-mono text-cyan-200">
                      {percentage(row.unique_checkouts, row.visitors)}
                    </td>
                    <td className="px-4 py-3 font-mono text-white">{row.orders}</td>
                    <td className="px-4 py-3 font-mono text-emerald-200">{row.paid_orders}</td>
                    <td className="px-4 py-3 font-mono text-emerald-300">
                      {money(row.paid_revenue_minor)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!attribution.isLoading && !attribution.data?.rows.length && (
            <p className="mt-4 rounded-xl border border-dashed border-white/[0.08] p-8 text-center text-sm text-white/35">
              Nenhuma visita, checkout ou venda com atribuição foi encontrada neste dia.
            </p>
          )}
        </div>
      ) : activeView === 'funnel' ? (
        <div className="p-5 md:p-6">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="hud-label">Funil total · dados first-party + backend</p>
              <h3 className="mt-2 text-xl font-semibold text-white">Da visita à compra</h3>
            </div>
            <div className="flex flex-wrap gap-1 rounded-lg border border-white/[0.07] bg-black/10 p-1">
              {[
                ['overview', 'Visão geral'],
                ['pages', 'Saída por página'],
                ['journeys', 'Jornada por lead'],
              ].map(([id, label]) => (
                <Button
                  key={id}
                  size="sm"
                  variant="ghost"
                  onClick={() => setFunnelDetail(id as typeof funnelDetail)}
                  className={cn(
                    'text-white/45',
                    funnelDetail === id && 'bg-cyan-300/[0.09] text-cyan-100',
                  )}
                >
                  {label}
                </Button>
              ))}
            </div>
          </div>
          {funnelDetail === 'overview' ? (
            <>
              <div className="overflow-hidden rounded-xl border border-white/[0.08] bg-black/15 p-4 md:p-6">
                <div className="grid grid-cols-4 text-center">
                  {['VISITA', 'CHECKOUT', 'PEDIDO', 'COMPRADOR'].map((label) => (
                    <p key={label} className="hud-label">
                      {label}
                    </p>
                  ))}
                </div>
                <svg
                  viewBox="0 0 1000 170"
                  preserveAspectRatio="none"
                  className="mt-3 h-40 w-full"
                  role="img"
                  aria-label="Fluxo de conversão da visita até a compra"
                >
                  <defs>
                    <linearGradient id="tmx-funnel-gradient" x1="0" x2="1">
                      <stop offset="0%" stopColor="#34e7a5" />
                      <stop offset="100%" stopColor="#2cc9ed" />
                    </linearGradient>
                    <filter id="tmx-funnel-glow">
                      <feGaussianBlur stdDeviation="5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                  <path
                    d="M0 15 C150 15 210 25 330 62 C470 64 560 68 665 73 C800 74 900 75 1000 76 L1000 94 C900 95 800 96 665 97 C560 102 470 106 330 108 C210 145 150 155 0 155 Z"
                    fill="url(#tmx-funnel-gradient)"
                    opacity="0.92"
                    filter="url(#tmx-funnel-glow)"
                  />
                  {[250, 500, 750].map((x) => (
                    <line key={x} x1={x} x2={x} y1="5" y2="165" stroke="rgba(255,255,255,.1)" />
                  ))}
                </svg>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { label: 'Visita', value: s?.visitors ?? 0, rate: '100%' },
                    {
                      label: 'Checkout',
                      value: s?.checkouts ?? 0,
                      rate: percentage(s?.checkouts ?? 0, s?.visitors ?? 0),
                    },
                    {
                      label: 'Pedido',
                      value: s?.orders ?? 0,
                      rate: percentage(s?.orders ?? 0, s?.visitors ?? 0),
                    },
                    {
                      label: 'Comprador',
                      value: buyers,
                      rate: percentage(buyers, s?.visitors ?? 0),
                    },
                  ].map((stage) => (
                    <div key={stage.label}>
                      <p className="font-mono text-xl font-semibold text-white md:text-3xl">
                        {stage.value.toLocaleString('pt-BR')}
                      </p>
                      <p className="mt-1 text-xs text-cyan-100/60">{stage.rate} do topo</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-4">
                {[
                  { label: 'Visita', value: s?.visitors ?? 0, icon: Users, rate: '100%' },
                  {
                    label: 'Checkout',
                    value: s?.checkouts ?? 0,
                    icon: ShoppingCart,
                    rate: percentage(s?.checkouts ?? 0, s?.visitors ?? 0),
                  },
                  {
                    label: 'Pedido',
                    value: s?.orders ?? 0,
                    icon: Activity,
                    rate: percentage(s?.orders ?? 0, s?.visitors ?? 0),
                  },
                  {
                    label: 'Comprador',
                    value: buyers,
                    icon: UserCheck,
                    rate: percentage(buyers, s?.visitors ?? 0),
                  },
                ].map(({ label, value, icon: Icon, rate }, index) => (
                  <div
                    key={label}
                    className="relative rounded-md border border-white/[0.07] bg-black/10 p-4"
                  >
                    <Icon className="h-4 w-4 text-cyan-300/70" />
                    <p className="mt-4 hud-label">{label}</p>
                    <p className="mt-1 font-mono text-2xl text-white">{value}</p>
                    <p className="mt-1 text-xs text-cyan-200/65">{rate} do topo</p>
                    {index < 3 && (
                      <span className="absolute -right-2.5 top-1/2 hidden text-white/20 md:block">
                        →
                      </span>
                    )}
                  </div>
                ))}
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-white/[0.07] p-4">
                  <p className="hud-label">Faturamento aprovado</p>
                  <p className="mt-2 font-mono text-lg text-emerald-300">
                    {money(s?.paid_revenue_minor)}
                  </p>
                </div>
                <div className="rounded-md border border-white/[0.07] p-4">
                  <p className="hud-label">Atribuição</p>
                  <p className="mt-2 font-mono text-lg text-cyan-300">
                    {percentage(
                      (s?.paid_orders ?? 0) - (s?.orphan_orders ?? 0),
                      s?.paid_orders ?? 0,
                    )}
                  </p>
                </div>
                <div className="rounded-md border border-white/[0.07] p-4">
                  <p className="hud-label">Vendas órfãs</p>
                  <p className="mt-2 font-mono text-lg text-amber-300">{s?.orphan_orders ?? 0}</p>
                </div>
              </div>
            </>
          ) : funnelDetail === 'pages' ? (
            <div className="space-y-2">
              {(pageFunnel.data?.pages ?? []).map((page) => {
                const exitRate = percentage(page.exits, page.visitors);
                return (
                  <div
                    key={page.page_url}
                    className="grid gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-4 md:grid-cols-[minmax(0,1fr)_100px_100px_140px]"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-white/80">
                        {page.page_title}
                      </p>
                      <p className="mt-1 truncate font-mono text-[10px] text-white/35">
                        {page.page_url}
                      </p>
                    </div>
                    <div>
                      <p className="hud-label">Visitantes</p>
                      <p className="mt-1 font-mono text-white">{page.visitors}</p>
                    </div>
                    <div>
                      <p className="hud-label">Views</p>
                      <p className="mt-1 font-mono text-white">{page.views}</p>
                    </div>
                    <div>
                      <p className="hud-label">Última página</p>
                      <p className="mt-1 font-mono text-amber-200">
                        {page.exits} · {exitRate}
                      </p>
                    </div>
                  </div>
                );
              })}
              {!pageFunnel.data?.pages.length && (
                <p className="rounded-xl border border-dashed border-white/[0.08] p-8 text-center text-sm text-white/35">
                  As páginas aparecerão depois dos primeiros PageViews.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {(journeys.data?.journeys ?? []).map((journey) => (
                <details
                  key={`${journey.visitor_id}-${journey.journey_id}`}
                  className="group rounded-xl border border-white/[0.07] bg-black/10"
                >
                  <summary className="cursor-pointer list-none p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs text-cyan-100/75">
                          {shortId(journey.visitor_id)}
                        </p>
                        <p className="mt-1 text-xs text-white/35">
                          {journey.pages.length} página(s) ·{' '}
                          {new Date(journey.last_seen_at).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {journey.events.includes('InitiateCheckout') && (
                          <span className="rounded-full bg-cyan-300/[0.08] px-2 py-1 text-[10px] text-cyan-200">
                            checkout
                          </span>
                        )}
                        {journey.order_status && (
                          <span className="rounded-full bg-emerald-300/[0.08] px-2 py-1 text-[10px] text-emerald-200">
                            pedido {journey.order_status}
                          </span>
                        )}
                      </div>
                    </div>
                  </summary>
                  <div className="border-t border-white/[0.06] p-4">
                    <ol className="space-y-0">
                      {journey.pages.map((page, index) => (
                        <li key={page.id} className="relative flex gap-3 pb-5 last:pb-0">
                          {index < journey.pages.length - 1 && (
                            <span className="absolute left-[7px] top-4 h-full w-px bg-cyan-300/15" />
                          )}
                          <span className="relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border border-cyan-300/35 bg-[#07151e]" />
                          <div className="min-w-0">
                            <p className="truncate text-sm text-white/75">{page.title}</p>
                            <p className="mt-1 truncate font-mono text-[10px] text-white/30">
                              {page.url}
                            </p>
                            <p className="mt-1 text-[10px] text-white/25">
                              {new Date(page.visited_at).toLocaleString('pt-BR')}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </div>
                </details>
              ))}
              {!journeys.data?.journeys.length && (
                <p className="rounded-xl border border-dashed border-white/[0.08] p-8 text-center text-sm text-white/35">
                  As jornadas aparecerão depois dos primeiros visitantes.
                </p>
              )}
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="grid gap-px bg-white/[0.06] sm:grid-cols-2 xl:grid-cols-6">
            {[
              ['Visitas', s?.visitors ?? 0],
              [
                'Connect Rate',
                s?.ad_clicks
                  ? `${((s.connected_clicks / s.ad_clicks) * 100).toFixed(1).replace('.', ',')}%`
                  : '—',
              ],
              ['Checkouts', `${s?.checkouts ?? 0} únicos · ${s?.checkout_events ?? 0} disparos`],
              [
                'Compradores',
                `${buyers} front · ${s?.upsell_orders ?? 0} upsell${
                  s?.unmapped_paid_orders ? ` · ${s.unmapped_paid_orders} não mapeados` : ''
                }`,
              ],
              ['Faturamento', money(s?.paid_revenue_minor)],
              [
                'Perda de dados',
                s?.webhooks_received
                  ? `${((s.webhooks_quarantined / s.webhooks_received) * 100)
                      .toFixed(1)
                      .replace(
                        '.',
                        ',',
                      )}% · ${s.webhooks_quarantined}/${s.webhooks_received} webhooks`
                  : '—',
              ],
            ].map(([label, value]) => (
              <div key={label} className="bg-[#06131d] p-4">
                <p className="hud-label">{label}</p>
                <p className="mt-1 font-mono text-xl text-white">{value}</p>
              </div>
            ))}
          </div>
          <div className="p-3 md:p-4">
            <TrackingCountryMap rows={countries.data?.rows ?? []} />
          </div>
          <div className="border-b border-white/[0.07] p-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex gap-1">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setFeed('sales')}
                  className={cn(feed === 'sales' && 'bg-white/[0.06] text-white')}
                >
                  Vendas
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setFeed('events')}
                  className={cn(feed === 'events' && 'bg-white/[0.06] text-white')}
                >
                  Eventos
                </Button>
              </div>
              {feed === 'sales' && (
                <label className="relative min-w-full sm:min-w-[280px]">
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-white/25" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="indexador, e-mail ou transação"
                    className="h-9 w-full rounded-md border border-white/[0.08] bg-black/15 pl-9 pr-3 text-xs text-white outline-none focus:border-cyan-300/30"
                  />
                </label>
              )}
            </div>
          </div>
          <div className="divide-y divide-white/[0.06]">
            {feed === 'sales'
              ? filteredOrders.slice(0, 12).map((order) => {
                  const delivered = deliveredTransactions.has(order.external_id);
                  return (
                    <div
                      key={order.id}
                      className="grid gap-2 px-4 py-3 text-xs md:grid-cols-[1fr_130px_110px_100px]"
                    >
                      <div>
                        <p className="font-medium text-white/75">{shortId(order.visitor_id)}</p>
                        <p className="mt-1 font-mono text-[10px] text-white/30">
                          {order.external_id}
                        </p>
                      </div>
                      <p className="text-white/55">
                        {money(order.amount_minor, order.currency ?? 'BRL')}
                      </p>
                      <p
                        className={cn(
                          'flex items-center gap-1.5',
                          delivered ? 'text-emerald-200' : 'text-amber-200',
                        )}
                      >
                        {delivered ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5" />
                        )}
                        {delivered ? 'no Meta' : order.status}
                      </p>
                      <p className="text-white/30">
                        {new Date(order.occurred_at).toLocaleString('pt-BR', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  );
                })
              : (events.data?.items ?? []).slice(0, 12).map((event) => (
                  <div
                    key={event.id}
                    className="grid gap-2 px-4 py-3 text-xs md:grid-cols-[140px_1fr_160px]"
                  >
                    <p className="font-medium text-cyan-200/75">{event.event_name}</p>
                    <div className="min-w-0">
                      <p className="truncate text-white/70">
                        {event.page_title || event.event_url}
                      </p>
                      {event.page_title && (
                        <p className="mt-1 truncate font-mono text-[10px] text-white/30">
                          {event.event_url}
                        </p>
                      )}
                      <p className="mt-1 font-mono text-[10px] text-white/30">
                        {shortId(event.visitor_id)}
                      </p>
                    </div>
                    <p className="text-white/30">
                      {new Date(event.received_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                ))}
            {((feed === 'sales' && filteredOrders.length === 0) ||
              (feed === 'events' && (events.data?.items.length ?? 0) === 0)) && (
              <div className="p-8 text-center text-sm text-white/35">
                Nenhum sinal encontrado nesta oferta.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
