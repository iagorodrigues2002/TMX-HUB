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
        <div className="glass-card rounded-2xl border border-border bg-background p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-foreground">Curva de retenção</p>
              <p className="text-xs text-muted-foreground">O marcador mostra o momento do pitch.</p>
            </div>
            <span className="rounded-full bg-accent px-3 py-1 text-xs text-primary">
              média {Number(singleAnalytics?.engagement?.engagement_rate ?? 0).toFixed(1)}%
            </span>
          </div>
          <div className="glass-card relative mt-6 flex h-44 items-end gap-px overflow-hidden rounded-xl border border-border bg-accent p-3">
            {curve
              .filter((_, index) => index % Math.max(1, Math.floor(curve.length / 90)) === 0)
              .map((point) => (
                <div
                  key={point.timed}
                  title={`${formatDuration(point.timed)} · ${point.total_users}`}
                  className="min-w-[2px] flex-1 rounded-t bg-gradient-to-t from-primary to-success"
                  style={{ height: `${Math.max(2, (point.total_users / maxCurve) * 100)}%` }}
                />
              ))}
            {singleAnalytics?.player.duration ? (
              <div
                className="absolute bottom-3 top-3 w-px bg-warning/10 shadow-[0_0_12px_rgba(252,211,77,.7)]"
                style={{
                  left: `${Math.min(100, (singleAnalytics.player.pitch_time / singleAnalytics.player.duration) * 100)}%`,
                }}
              >
                <span className="absolute -top-5 -translate-x-1/2 whitespace-nowrap text-[9px] uppercase tracking-wider text-warning">
                  pitch
                </span>
              </div>
            ) : null}
          </div>
        </div>
        <div className="glass-card rounded-2xl border border-border bg-background p-4">
          <p className="text-sm font-medium text-foreground">Diagnóstico rápido</p>
          <div className="mt-4 space-y-3 text-xs text-muted-foreground">
            <div className="flex gap-3">
              <PlayCircle className="text-primary" size={17} />
              <span>
                Play rate:{' '}
                <strong className="text-foreground">
                  {views ? ((plays / views) * 100).toFixed(1) : '0.0'}%
                </strong>
              </span>
            </div>
            <div className="flex gap-3">
              <Clock3 className="text-warning" size={17} />
              <span>
                Tempo médio:{' '}
                <strong className="text-foreground">
                  {formatDuration(singleAnalytics?.engagement?.average_watched_time)}
                </strong>
              </span>
            </div>
            <div className="flex gap-3">
              <MousePointerClick className="text-success" size={17} />
              <span>
                CTR por play:{' '}
                <strong className="text-foreground">
                  {plays ? ((clicks / plays) * 100).toFixed(1) : '0.0'}%
                </strong>
              </span>
            </div>
            {pitchRate < 20 && plays > 20 ? (
              <div className="flex gap-3 rounded-lg border border-danger/30 bg-danger/10 p-3 text-danger">
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
      <div className="glass-card overflow-hidden rounded-2xl border border-border bg-background">
        <div className="flex items-center gap-2 border-b border-border p-4">
          <Eye size={16} className="text-primary" />
          <div>
            <p className="text-sm font-medium text-foreground">Performance por país</p>
            <p className="text-xs text-muted-foreground">
              Retenção, intenção e receita lado a lado.
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-xs">
            <thead className="text-[9px] uppercase tracking-wider text-muted-foreground">
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
                  className="border-t border-border text-muted-foreground"
                >
                  <td className="px-4 py-3 font-medium text-foreground">{country.grouped_field}</td>
                  <td className="px-4 py-3">{country.total_viewed_device_uniq}</td>
                  <td className="px-4 py-3">{Number(country.play_rate).toFixed(1)}%</td>
                  <td
                    className={cn(
                      'px-4 py-3',
                      Number(country.over_pitch_rate) < 20 && 'text-danger',
                    )}
                  >
                    {Number(country.over_pitch_rate).toFixed(1)}%
                  </td>
                  <td className="px-4 py-3">{Number(country.engagement_rate).toFixed(1)}%</td>
                  <td className="px-4 py-3">{country.total_clicked_device_uniq}</td>
                  <td className="px-4 py-3 text-success">{country.total_conversions}</td>
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
