'use client';

import { TrackerKpiRow } from '@/components/tracking/tracker-kpi-row';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { CheckCircle2, Search, XCircle } from 'lucide-react';
import { TrackingCountryMap, money, shortId } from './tracking-live-console-support';
import type { useTrackingLiveConsoleState } from './tracking-live-console-use-tracking-live-console-state';

export function renderLiveFeed({
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
}: Pick<
  ReturnType<typeof useTrackingLiveConsoleState>,
  | 'feed'
  | 'setFeed'
  | 'search'
  | 'setSearch'
  | 'summary'
  | 'events'
  | 'countries'
  | 'filteredOrders'
  | 'deliveredTransactions'
  | 's'
>) {
  return (
    <div>
      <TrackerKpiRow summary={s} />
      <div className="p-3 md:p-4">
        <TrackingCountryMap rows={countries.data?.rows ?? []} />
      </div>
      <div className="border-b border-border p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setFeed('sales')}
              className={cn(feed === 'sales' && 'bg-accent text-foreground')}
            >
              Vendas
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setFeed('events')}
              className={cn(feed === 'events' && 'bg-accent text-foreground')}
            >
              Eventos
            </Button>
          </div>
          {feed === 'sales' && (
            <label className="relative min-w-full sm:min-w-[280px]">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="indexador, e-mail ou transação"
                className="h-9 w-full rounded-md border border-border bg-accent pl-9 pr-3 text-xs text-foreground outline-none focus:border-border"
              />
            </label>
          )}
        </div>
      </div>
      <div className="divide-y divide-border">
        {feed === 'sales'
          ? filteredOrders.slice(0, 12).map((order) => {
              const delivered = deliveredTransactions.has(order.external_id);
              return (
                <div
                  key={order.id}
                  className="grid gap-2 px-4 py-3 text-xs md:grid-cols-[1fr_130px_110px_100px]"
                >
                  <div>
                    <p className="font-medium text-foreground">{shortId(order.visitor_id)}</p>
                    <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                      {order.external_id}
                    </p>
                  </div>
                  <p className="text-muted-foreground">
                    {money(order.amount_minor, order.currency ?? 'BRL')}
                  </p>
                  <p
                    className={cn(
                      'flex items-center gap-1.5',
                      delivered ? 'text-success' : 'text-warning',
                    )}
                  >
                    {delivered ? (
                      <CheckCircle2 className="h-3.5 w-3.5" />
                    ) : (
                      <XCircle className="h-3.5 w-3.5" />
                    )}
                    {delivered ? 'no Meta' : order.status}
                  </p>
                  <p className="text-muted-foreground">
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
                <p className="font-medium text-primary">{event.event_name}</p>
                <div className="min-w-0">
                  <p className="truncate text-muted-foreground">
                    {event.page_title || event.event_url}
                  </p>
                  {event.page_title && (
                    <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                      {event.event_url}
                    </p>
                  )}
                  <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                    {shortId(event.visitor_id)}
                  </p>
                </div>
                <p className="text-muted-foreground">
                  {new Date(event.received_at).toLocaleString('pt-BR')}
                </p>
              </div>
            ))}
        {((feed === 'sales' && filteredOrders.length === 0) ||
          (feed === 'events' && (events.data?.items.length ?? 0) === 0)) && (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhum sinal encontrado nesta oferta.
          </div>
        )}
      </div>
    </div>
  );
}
