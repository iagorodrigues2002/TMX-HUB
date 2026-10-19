'use client';
import { formatMoney } from '@/lib/currency-preference';
import { cn } from '@/lib/utils';
import { PlayCircle } from 'lucide-react';
import { Clock3 } from 'lucide-react';
import { MousePointerClick } from 'lucide-react';
import { AlertTriangle } from 'lucide-react';
import { Eye } from 'lucide-react';
import { Metric } from './metric';
import { formatDuration } from './tracking-helpers';
import type { useVturbIntelligence } from './use-vturb-intelligence';
export function renderVturbAnalytics({
  views,
  plays,
  singleAnalytics,
  pitchRate,
  clicks,
  conversions,
  curve,
  maxCurve,
  countries,
}: {
  views: ReturnType<typeof useVturbIntelligence>['views'];
  plays: ReturnType<typeof useVturbIntelligence>['plays'];
  singleAnalytics: ReturnType<typeof useVturbIntelligence>['singleAnalytics'];
  pitchRate: ReturnType<typeof useVturbIntelligence>['pitchRate'];
  clicks: ReturnType<typeof useVturbIntelligence>['clicks'];
  conversions: ReturnType<typeof useVturbIntelligence>['conversions'];
  curve: ReturnType<typeof useVturbIntelligence>['curve'];
  maxCurve: ReturnType<typeof useVturbIntelligence>['maxCurve'];
  countries: ReturnType<typeof useVturbIntelligence>['countries'];
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Visualizações" value={views.toLocaleString('pt-BR')} />
        <Metric label="Plays" value={plays.toLocaleString('pt-BR')} />
        <Metric label="Tempo do pitch" value={formatDuration(singleAnalytics?.player.pitch_time)} />
        <Metric label="Retenção no pitch" value={`${pitchRate.toFixed(1)}%`} />
        <Metric label="Cliques" value={clicks.toLocaleString('pt-BR')} />
        <Metric label="Conversões VTurb" value={conversions.toLocaleString('pt-BR')} />
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-2xl border border-white/[0.08] bg-[#06151b]/80 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-white/85">Curva de retenção</p>
              <p className="text-xs text-white/35">O marcador mostra o momento do pitch.</p>
            </div>
            <span className="rounded-full bg-cyan-300/10 px-3 py-1 text-xs text-cyan-200">
              média {Number(singleAnalytics?.engagement?.engagement_rate ?? 0).toFixed(1)}%
            </span>
          </div>
          <div className="relative mt-6 flex h-44 items-end gap-px overflow-hidden rounded-xl border border-white/[0.06] bg-black/15 p-3">
            {curve
              .filter((_, index) => index % Math.max(1, Math.floor(curve.length / 90)) === 0)
              .map((point) => (
                <div
                  key={point.timed}
                  title={`${formatDuration(point.timed)} · ${point.total_users}`}
                  className="min-w-[2px] flex-1 rounded-t bg-gradient-to-t from-cyan-500/35 to-emerald-300/90"
                  style={{ height: `${Math.max(2, (point.total_users / maxCurve) * 100)}%` }}
                />
              ))}
            {singleAnalytics?.player.duration ? (
              <div
                className="absolute bottom-3 top-3 w-px bg-amber-300 shadow-[0_0_12px_rgba(252,211,77,.7)]"
                style={{
                  left: `${Math.min(100, (singleAnalytics.player.pitch_time / singleAnalytics.player.duration) * 100)}%`,
                }}
              >
                <span className="absolute -top-5 -translate-x-1/2 whitespace-nowrap text-[9px] uppercase tracking-wider text-amber-200">
                  pitch
                </span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-[#06151b]/80 p-4">
          <p className="text-sm font-medium text-white/85">Diagnóstico rápido</p>
          <div className="mt-4 space-y-3 text-xs text-white/50">
            <div className="flex gap-3">
              <PlayCircle className="text-cyan-300" size={17} />
              <span>
                Play rate:{' '}
                <strong className="text-white/85">
                  {views ? ((plays / views) * 100).toFixed(1) : '0.0'}%
                </strong>
              </span>
            </div>
            <div className="flex gap-3">
              <Clock3 className="text-amber-300" size={17} />
              <span>
                Tempo médio:{' '}
                <strong className="text-white/85">
                  {formatDuration(singleAnalytics?.engagement?.average_watched_time)}
                </strong>
              </span>
            </div>
            <div className="flex gap-3">
              <MousePointerClick className="text-emerald-300" size={17} />
              <span>
                CTR por play:{' '}
                <strong className="text-white/85">
                  {plays ? ((clicks / plays) * 100).toFixed(1) : '0.0'}%
                </strong>
              </span>
            </div>
            {pitchRate < 20 && plays > 20 ? (
              <div className="flex gap-3 rounded-lg border border-rose-300/20 bg-rose-300/[0.06] p-3 text-rose-100/80">
                <AlertTriangle size={17} />
                <span>
                  Poucos espectadores chegam ao pitch. Avalie antecipar a oferta ou fortalecer a
                  abertura.
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </div>
      <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-[#06151b]/80">
        <div className="flex items-center gap-2 border-b border-white/[0.07] p-4">
          <Eye size={16} className="text-cyan-300" />
          <div>
            <p className="text-sm font-medium text-white/85">Performance por país</p>
            <p className="text-xs text-white/35">Retenção, intenção e receita lado a lado.</p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-[9px] uppercase tracking-wider text-white/30">
              <tr>
                {[
                  'País',
                  'Views',
                  'Play rate',
                  'Retenção pitch',
                  'Engajamento',
                  'Cliques',
                  'Conversões',
                  'Receita',
                ].map((label) => (
                  <th key={label} className="px-4 py-3 font-medium">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {countries.map((country) => (
                <tr
                  key={country.grouped_field}
                  className="border-t border-white/[0.05] text-white/65"
                >
                  <td className="px-4 py-3 font-medium text-white/85">{country.grouped_field}</td>
                  <td className="px-4 py-3">{country.total_viewed_device_uniq}</td>
                  <td className="px-4 py-3">{Number(country.play_rate).toFixed(1)}%</td>
                  <td
                    className={cn(
                      'px-4 py-3',
                      Number(country.over_pitch_rate) < 20 && 'text-rose-300',
                    )}
                  >
                    {Number(country.over_pitch_rate).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3">{Number(country.engagement_rate).toFixed(1)}%</td>
                  <td className="px-4 py-3">{country.total_clicked_device_uniq}</td>
                  <td className="px-4 py-3 text-emerald-200">{country.total_conversions}</td>
                  <td className="px-4 py-3">
                    {country.total_amount_brl
                      ? formatMoney(country.total_amount_brl * 100, 'BRL')
                      : country.total_amount_usd
                        ? formatMoney(country.total_amount_usd * 100, 'USD')
                        : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
