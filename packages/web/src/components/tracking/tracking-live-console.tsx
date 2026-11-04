'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CheckCircle2, Database, Filter, Loader2, Megaphone, RadioTower } from 'lucide-react';
import { renderAttributionView } from './tracking-live-console-render-attribution-view';
import { renderFunnelView } from './tracking-live-console-render-funnel-view';
import { renderLiveFeed } from './tracking-live-console-render-live-feed';
import type { View } from './tracking-live-console-support';
import { useTrackingLiveConsoleState } from './tracking-live-console-use-tracking-live-console-state';

export function TrackingLiveConsole({
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
  const {
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
  } = useTrackingLiveConsoleState({ offerId, mode, from, to });

  return (
    <section className="glass-card overflow-hidden rounded-lg border border-border bg-muted">
      {!mode && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-3">
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
                  'gap-2 text-muted-foreground',
                  activeView === id && 'bg-success/10 text-success',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </Button>
            ))}
          </div>
          <p className="flex items-center gap-2 text-[10px] uppercase tracking-[0.16em] text-success">
            <span className="status-dot" aria-hidden /> atualização automática · 30s
          </p>
        </div>
      )}

      {summary.isLoading ? (
        <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando sinais…
        </div>
      ) : activeView === 'infrastructure' ? (
        <div className="p-5 md:p-6">
          <div className="mb-5">
            <p className="hud-label">Infraestrutura gerenciada</p>
            <h3 className="mt-2 text-xl font-semibold text-foreground">
              Nenhum acesso ao Railway é necessário
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
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
                    ready ? 'border-success/30 bg-success/10' : 'border-warning/30 bg-warning/10',
                  )}
                >
                  {ready ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : (
                    <Loader2 className="h-4 w-4 animate-spin text-warning" />
                  )}
                  <p className="mt-3 text-sm font-medium text-foreground">{label}</p>
                  <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {ready ? 'operacional' : 'atualizando automaticamente'}
                  </p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 rounded-md border border-border bg-accent p-4 text-xs leading-5 text-muted-foreground">
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
                <div key={label} className="rounded-md border border-border bg-accent p-3">
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {label}
                  </p>
                  <p className="mt-1 font-mono text-sm text-foreground">{value}</p>
                </div>
              ))}
            </div>
            {diagnostics.data?.utmify.hint && (
              <div className="mt-3 rounded-md border border-warning/30 bg-warning/10 p-4 text-xs leading-5 text-warning">
                {diagnostics.data.utmify.hint}
              </div>
            )}
            {diagnostics.data?.utmify.last_error && (
              <div className="mt-2 rounded-md border border-danger/30 bg-danger/10 p-4 text-xs leading-5 text-danger">
                Último erro: {diagnostics.data.utmify.last_error}
              </div>
            )}
          </div>
        </div>
      ) : activeView === 'attribution' ? (
        renderAttributionView({ orders, attribution })
      ) : activeView === 'funnel' ? (
        renderFunnelView({
          funnelDetail,
          setFunnelDetail,
          summary,
          events,
          orders,
          pageFunnel,
          journeys,
          s,
          buyers,
        })
      ) : (
        renderLiveFeed({
          feed,
          setFeed,
          search,
          setSearch,
          summary,
          events,
          countries,
          filteredOrders,
          deliveredTransactions,
          s,
        })
      )}
    </section>
  );
}
