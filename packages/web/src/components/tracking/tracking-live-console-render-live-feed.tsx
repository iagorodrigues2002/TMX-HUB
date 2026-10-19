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
                    <p className="mt-1 font-mono text-[10px] text-white/30">{order.external_id}</p>
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
                  <p className="truncate text-white/70">{event.page_title || event.event_url}</p>
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
  );
}
