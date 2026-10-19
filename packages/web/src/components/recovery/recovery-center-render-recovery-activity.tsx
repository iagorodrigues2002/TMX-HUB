'use client';

import { Clock3, MousePointerClick } from 'lucide-react';
import type { useRecoveryCenterState } from './recovery-center-use-recovery-center-state';

export function renderRecoveryActivity({
  activityFilter,
  setActivityFilter,
  channel,
  r,
}: Pick<
  ReturnType<typeof useRecoveryCenterState>,
  'activityFilter' | 'setActivityFilter' | 'channel' | 'r'
>) {
  return (
    <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
      <div className="glass-card overflow-hidden p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="hud-label">Conversões atribuídas ao Recovery</p>
            <p className="mt-1 text-xs text-white/40">
              Cada compra abaixo possui uma mensagem e um clique TMX comprovados.
            </p>
          </div>
          <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-1 font-mono text-xs text-emerald-300">
            {r?.conversions.length ?? 0} conversão(ões)
          </span>
        </div>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-xs">
            <thead className="border-b border-white/[0.08] text-[9px] uppercase tracking-[0.16em] text-white/35">
              <tr>
                <th className="pb-3 font-medium">Comprador / produto</th>
                <th className="pb-3 font-medium">Canal</th>
                <th className="pb-3 font-medium">Jornada</th>
                <th className="pb-3 text-right font-medium">Recuperado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {(r?.conversions ?? []).map((conversion) => (
                <tr key={conversion.opportunity_id}>
                  <td className="py-3 pr-4">
                    <p className="font-medium text-white/80">
                      {conversion.buyer_name || conversion.email || 'Comprador identificado'}
                    </p>
                    <p className="mt-1 text-[10px] text-white/35">
                      {conversion.product?.name || conversion.recovered_external_id}
                    </p>
                  </td>
                  <td className="py-3 font-mono text-cyan-200/70">
                    {conversion.recovered_channel || 'link anterior'}
                  </td>
                  <td className="py-3 text-[10px] text-white/40">
                    <span className={conversion.opened_at ? 'text-emerald-300' : ''}>abriu</span>
                    {' → '}
                    <span className={conversion.clicked_at ? 'text-emerald-300' : ''}>clicou</span>
                    {' → '}
                    <span className="text-emerald-300">comprou</span>
                  </td>
                  <td className="py-3 text-right">
                    <p className="font-mono text-sm text-emerald-300">
                      R${' '}
                      {(Number(conversion.recovered_minor) / 100).toLocaleString('pt-BR', {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                    <p className="mt-1 text-[9px] text-white/30">
                      {new Date(conversion.recovered_at).toLocaleString('pt-BR')}
                    </p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!r?.conversions.length && (
            <div className="py-10 text-center text-xs text-white/30">
              As próximas compras após um clique aparecerão aqui com a origem exata.
            </div>
          )}
        </div>
      </div>
      <div className="glass-card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="hud-label">Atividade em tempo real</p>
            <p className="mt-1 text-xs text-white/40">
              Todas as aberturas e cliques, não só o primeiro.
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {(['all', 'opened', 'clicked', 'converted'] as const).map((filter) => (
              <button
                type="button"
                key={filter}
                onClick={() => setActivityFilter(filter)}
                className={`rounded-md border px-2 py-1 text-[9px] uppercase ${
                  activityFilter === filter
                    ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200'
                    : 'border-white/[0.07] text-white/35'
                }`}
              >
                {filter === 'all'
                  ? 'Tudo'
                  : filter === 'opened'
                    ? 'Aberturas'
                    : filter === 'clicked'
                      ? 'Cliques'
                      : 'Conversões'}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4 max-h-[390px] space-y-2 overflow-y-auto pr-1">
          {(r?.activity ?? [])
            .filter((event) => activityFilter === 'all' || event.event_type === activityFilter)
            .map((event) => (
              <div
                key={event.id}
                className="flex gap-3 rounded-xl border border-white/[0.06] bg-black/10 p-3"
              >
                <span className="mt-0.5 text-cyan-300">
                  {event.event_type === 'clicked' ? (
                    <MousePointerClick className="h-4 w-4" />
                  ) : (
                    <Clock3 className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-white/75">
                      {event.event_type === 'opened'
                        ? 'E-mail aberto'
                        : event.event_type === 'clicked'
                          ? 'Link clicado'
                          : event.event_type === 'converted'
                            ? 'Compra recuperada'
                            : event.event_type}
                    </p>
                    <span className="font-mono text-[8px] uppercase text-white/30">
                      {event.channel}
                    </span>
                  </div>
                  <p className="mt-1 truncate text-[10px] text-white/35">
                    {event.buyer_name || event.email || event.phone || event.external_id}
                  </p>
                  <p className="mt-1 text-[9px] text-white/25">
                    {new Date(event.event_at).toLocaleString('pt-BR')}
                  </p>
                </div>
              </div>
            ))}
        </div>
      </div>
    </section>
  );
}
