'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Activity, ShoppingCart, UserCheck, Users } from 'lucide-react';
import { money, percentage, shortId } from './tracking-live-console-support';
import type { useTrackingLiveConsoleState } from './tracking-live-console-use-tracking-live-console-state';

export function renderFunnelView({
  funnelDetail,
  setFunnelDetail,
  summary,
  events,
  orders,
  pageFunnel,
  journeys,
  s,
  buyers,
}: Pick<
  ReturnType<typeof useTrackingLiveConsoleState>,
  | 'funnelDetail'
  | 'setFunnelDetail'
  | 'summary'
  | 'events'
  | 'orders'
  | 'pageFunnel'
  | 'journeys'
  | 's'
  | 'buyers'
>) {
  return (
    <div className="p-5 md:p-6">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="hud-label">Funil total · dados first-party + backend</p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">Da visita à compra</h3>
        </div>
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-accent p-1">
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
                'text-muted-foreground',
                funnelDetail === id && 'bg-accent text-primary',
              )}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      {funnelDetail === 'overview' ? (
        <>
          <div className="glass-card overflow-x-auto rounded-xl border border-border bg-accent p-4 md:p-6">
            <div className="grid min-w-[640px] grid-cols-4 text-center">
              {['VISITA', 'CHECKOUT', 'PEDIDO', 'COMPRADOR'].map((label) => (
                <p key={label} className="hud-label">
                  {label}
                </p>
              ))}
            </div>
            <svg
              viewBox="0 0 1000 170"
              preserveAspectRatio="none"
              className="mt-3 h-40 w-full min-w-[640px]"
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
            <div className="grid min-w-[640px] grid-cols-4 gap-2 text-center">
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
                  <p className="font-mono text-xl font-semibold text-foreground md:text-3xl">
                    {stage.value.toLocaleString('pt-BR')}
                  </p>
                  <p className="mt-1 text-xs text-primary">{stage.rate} do topo</p>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 xl:grid-cols-4">
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
              <div key={label} className="relative rounded-md border border-border bg-accent p-4">
                <Icon className="h-4 w-4 text-primary" />
                <p className="mt-4 hud-label">{label}</p>
                <p className="mt-1 font-mono text-2xl text-foreground">{value}</p>
                <p className="mt-1 text-xs text-primary">{rate} do topo</p>
                {index < 3 && (
                  <span className="absolute -right-2.5 top-1/2 hidden text-muted-foreground xl:block">
                    →
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border p-4">
              <p className="hud-label">Faturamento aprovado</p>
              <p className="mt-2 font-mono text-lg text-success">{money(s?.paid_revenue_minor)}</p>
            </div>
            <div className="rounded-md border border-border p-4">
              <p className="hud-label">Atribuição</p>
              <p className="mt-2 font-mono text-lg text-primary">
                {percentage((s?.paid_orders ?? 0) - (s?.orphan_orders ?? 0), s?.paid_orders ?? 0)}
              </p>
            </div>
            <div className="rounded-md border border-border p-4">
              <p className="hud-label">Vendas órfãs</p>
              <p className="mt-2 font-mono text-lg text-warning">{s?.orphan_orders ?? 0}</p>
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
                className="glass-card grid gap-3 rounded-xl border border-border bg-accent p-4 md:grid-cols-[minmax(0,1fr)_100px_100px_140px]"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{page.page_title}</p>
                  <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                    {page.page_url}
                  </p>
                </div>
                <div>
                  <p className="hud-label">Visitantes</p>
                  <p className="mt-1 font-mono text-foreground">{page.visitors}</p>
                </div>
                <div>
                  <p className="hud-label">Views</p>
                  <p className="mt-1 font-mono text-foreground">{page.views}</p>
                </div>
                <div>
                  <p className="hud-label">Última página</p>
                  <p className="mt-1 font-mono text-warning">
                    {page.exits} · {exitRate}
                  </p>
                </div>
              </div>
            );
          })}
          {!pageFunnel.data?.pages.length && (
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              As páginas aparecerão depois dos primeiros PageViews.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {(journeys.data?.journeys ?? []).map((journey) => (
            <details
              key={`${journey.visitor_id}-${journey.journey_id}`}
              className="group rounded-xl border border-border bg-accent"
            >
              <summary className="cursor-pointer list-none p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs text-primary">{shortId(journey.visitor_id)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {journey.pages.length} página(s) ·{' '}
                      {new Date(journey.last_seen_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {journey.events.includes('InitiateCheckout') && (
                      <span className="rounded-full bg-accent px-2 py-1 text-[10px] text-primary">
                        checkout
                      </span>
                    )}
                    {journey.order_status && (
                      <span className="rounded-full bg-success/10 px-2 py-1 text-[10px] text-success">
                        pedido {journey.order_status}
                      </span>
                    )}
                  </div>
                </div>
              </summary>
              <div className="border-t border-border p-4">
                <ol className="space-y-0">
                  {journey.pages.map((page, index) => (
                    <li key={page.id} className="relative flex gap-3 pb-5 last:pb-0">
                      {index < journey.pages.length - 1 && (
                        <span className="absolute left-[7px] top-4 h-full w-px bg-accent" />
                      )}
                      <span className="relative mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border border-border bg-background" />
                      <div className="min-w-0">
                        <p className="truncate text-sm text-foreground">{page.title}</p>
                        <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                          {page.url}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
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
            <p className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              As jornadas aparecerão depois dos primeiros visitantes.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
