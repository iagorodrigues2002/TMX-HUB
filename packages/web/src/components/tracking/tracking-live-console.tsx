'use client';

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
  RadioTower,
  Search,
  ShoppingCart,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import { useMemo, useState } from 'react';

type View = 'tracker' | 'funnel' | 'infrastructure';

function money(minor: string | number | undefined, currency = 'BRL') {
  const value = Number(minor ?? 0) / 100;
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
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
}: {
  offerId: string;
  mode?: 'tracker' | 'funnel' | 'infrastructure';
}) {
  const [view, setView] = useState<View>('tracker');
  const activeView = mode ?? view;
  const [feed, setFeed] = useState<'sales' | 'events'>('sales');
  const [funnelDetail, setFunnelDetail] = useState<'overview' | 'pages' | 'journeys'>('overview');
  const [search, setSearch] = useState('');
  const summary = useQuery({
    queryKey: ['tracking-summary', offerId],
    queryFn: () => apiClient.getTrackingSummary(offerId),
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
    queryKey: ['tracking-events', offerId],
    queryFn: () => apiClient.listTrackingEvents(offerId, 1, 50),
    refetchInterval: 30_000,
    retry: false,
  });
  const orders = useQuery({
    queryKey: ['tracking-orders', offerId],
    queryFn: () => apiClient.listTrackingOrders(offerId, 1, 50),
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
    queryKey: ['tracking-page-funnel', offerId],
    queryFn: () => apiClient.getTrackingPageFunnel(offerId),
    enabled: activeView === 'funnel',
    refetchInterval: 30_000,
    retry: false,
  });
  const journeys = useQuery({
    queryKey: ['tracking-journeys', offerId],
    queryFn: () => apiClient.listTrackingJourneys(offerId),
    enabled: activeView === 'funnel',
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
  const buyers = s?.paid_orders ?? 0;

  return (
    <section className="overflow-hidden rounded-lg border border-white/[0.08] bg-white/[0.02]">
      {!mode && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.07] p-3">
          <div className="flex flex-wrap gap-1">
            {[
              { id: 'tracker' as const, label: 'Tracker', icon: RadioTower },
              { id: 'funnel' as const, label: 'Funil', icon: Filter },
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
                    <line
                      key={x}
                      x1={x}
                      x2={x}
                      y1="5"
                      y2="165"
                      stroke="rgba(255,255,255,.1)"
                    />
                  ))}
                </svg>
                <div className="grid grid-cols-4 gap-2 text-center">
                  {[
                    { value: s?.visitors ?? 0, rate: '100%' },
                    {
                      value: s?.checkouts ?? 0,
                      rate: percentage(s?.checkouts ?? 0, s?.visitors ?? 0),
                    },
                    {
                      value: s?.orders ?? 0,
                      rate: percentage(s?.orders ?? 0, s?.visitors ?? 0),
                    },
                    {
                      value: buyers,
                      rate: percentage(buyers, s?.visitors ?? 0),
                    },
                  ].map((stage, index) => (
                    <div key={index}>
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
                {percentage((s?.paid_orders ?? 0) - (s?.orphan_orders ?? 0), s?.paid_orders ?? 0)}
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
          <div className="grid gap-px bg-white/[0.06] sm:grid-cols-4">
            {[
              ['Visitas', s?.visitors ?? 0],
              ['Checkouts', s?.checkouts ?? 0],
              ['Compradores', buyers],
              ['Faturamento', money(s?.paid_revenue_minor)],
            ].map(([label, value]) => (
              <div key={label} className="bg-[#06131d] p-4">
                <p className="hud-label">{label}</p>
                <p className="mt-1 font-mono text-xl text-white">{value}</p>
              </div>
            ))}
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
