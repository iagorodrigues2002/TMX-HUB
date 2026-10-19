'use client';

import { formatInt, formatRoas } from '@/components/dashboard/kpi-cards';
import { Label } from '@/components/ui/label';
import { todayIso } from '@/lib/date-range';
import type { useOfertaDetailPageState } from './page-use-oferta-detail-page-state';
import { WindowMetrics } from './page-window-metrics';

export function renderIntradayOverview({
  compareLeft,
  setCompareLeft,
  compareRight,
  setCompareRight,
  intradayFrom,
  intradayTo,
  isIntradayRange,
  intraday,
  currency,
  money,
  availableWindows,
  leftWindow,
  rightWindow,
  currentWindow,
}: Pick<
  ReturnType<typeof useOfertaDetailPageState>,
  | 'compareLeft'
  | 'setCompareLeft'
  | 'compareRight'
  | 'setCompareRight'
  | 'intradayFrom'
  | 'intradayTo'
  | 'isIntradayRange'
  | 'currency'
  | 'money'
  | 'availableWindows'
  | 'leftWindow'
  | 'rightWindow'
  | 'currentWindow'
> & { intraday: NonNullable<ReturnType<typeof useOfertaDetailPageState>['intraday']> }) {
  return (
    <>
      <div className={`grid gap-4 ${isIntradayRange ? '' : 'xl:grid-cols-2'}`}>
        <article className="glass-card p-4">
          <p className="hud-label">
            {isIntradayRange
              ? `Acumulado no período · ${new Date(`${intradayFrom}T12:00:00`).toLocaleDateString('pt-BR')} a ${new Date(`${intradayTo}T12:00:00`).toLocaleDateString('pt-BR')}`
              : `Janela geral · ${new Date(`${intradayFrom}T12:00:00`).toLocaleDateString('pt-BR')}`}
          </p>
          <p className="mt-1 text-xs text-white/45">
            {isIntradayRange
              ? `Soma de ${'days' in intraday ? intraday.days : 0} dia(s)`
              : 'Acumulado desde 00h'}
          </p>
          <WindowMetrics metrics={intraday.overall} currency={currency} />
        </article>
        {!isIntradayRange && (
          <article className="glass-card border-cyan-300/15 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="hud-label">
                  {intradayFrom === todayIso() ? 'Janela atual' : 'Última janela disponível'}
                </p>
                <p className="mt-1 text-xs text-white/45">
                  {currentWindow?.label ?? 'Aguardando checkpoint'}
                </p>
              </div>
              {currentWindow?.partial && (
                <span className="rounded-full border border-amber-300/20 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-amber-200">
                  Parcial
                </span>
              )}
            </div>
            {currentWindow?.available ? (
              <WindowMetrics metrics={currentWindow.metrics} currency={currency} />
            ) : (
              <p className="mt-5 text-xs text-white/45">
                É necessário um checkpoint anterior ao início da janela para calcular a diferença.
              </p>
            )}
          </article>
        )}
      </div>

      <div className="glass-card overflow-hidden p-0">
        <header className="border-b border-white/[0.06] px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Janelas de 2 horas</h3>
          <p className="mt-1 text-xs text-white/40">
            Cada valor representa somente o que aconteceu dentro daquela faixa.
          </p>
        </header>
        <div className="grid gap-px bg-white/[0.04] sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {intraday.windows.map((window) => (
            <article key={window.index} className="bg-[#07151b] p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-sm font-semibold text-white/85">{window.label}</p>
                <span className="text-[10px] uppercase tracking-[0.12em] text-white/30">
                  {isIntradayRange && 'daysAvailable' in window
                    ? `${window.daysAvailable}/${'days' in intraday ? intraday.days : 0} dias`
                    : `${window.samples} coleta(s)`}
                </span>
              </div>
              {window.available ? (
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <dt className="text-white/35">Investido</dt>
                    <dd className="font-mono text-amber-300">{money(window.metrics.spend)}</dd>
                  </div>
                  <div>
                    <dt className="text-white/35">Vendas</dt>
                    <dd className="font-mono text-emerald-300">
                      {formatInt(window.metrics.sales)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-white/35">CPA</dt>
                    <dd className="font-mono text-white/75">{money(window.metrics.cpa)}</dd>
                  </div>
                  <div>
                    <dt className="text-white/35">IC</dt>
                    <dd className="font-mono text-cyan-300">{formatInt(window.metrics.ic)}</dd>
                  </div>
                  <div>
                    <dt className="text-white/35">CPA IC</dt>
                    <dd className="font-mono text-white/75">{money(window.metrics.icCpa)}</dd>
                  </div>
                  <div>
                    <dt className="text-white/35">ROAS</dt>
                    <dd className="font-mono text-cyan-300">{formatRoas(window.metrics.roas)}</dd>
                  </div>
                </dl>
              ) : (
                <p className="mt-3 text-xs text-white/30">
                  {window.partial
                    ? 'Coleta iniciada no meio desta janela.'
                    : 'Sem dados coletados.'}
                </p>
              )}
            </article>
          ))}
        </div>
      </div>

      <div className="glass-card p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="mr-auto">
            <h3 className="text-sm font-semibold text-white">Comparar janelas</h3>
            <p className="mt-1 text-xs text-white/40">Selecione duas faixas já calculadas.</p>
          </div>
          <Label className="space-y-1">
            <span className="hud-label">Janela A</span>
            <select
              value={compareLeft}
              onChange={(event) => setCompareLeft(event.target.value)}
              className="block h-9 rounded-md border border-white/10 bg-bg-elevated px-3 text-xs text-white"
            >
              <option value="">Anterior disponível</option>
              {availableWindows.map((window) => (
                <option key={window.index} value={window.index}>
                  {window.label}
                </option>
              ))}
            </select>
          </Label>
          <Label className="space-y-1">
            <span className="hud-label">Janela B</span>
            <select
              value={compareRight}
              onChange={(event) => setCompareRight(event.target.value)}
              className="block h-9 rounded-md border border-white/10 bg-bg-elevated px-3 text-xs text-white"
            >
              <option value="">Mais recente disponível</option>
              {availableWindows.map((window) => (
                <option key={window.index} value={window.index}>
                  {window.label}
                </option>
              ))}
            </select>
          </Label>
        </div>
        {leftWindow?.available && rightWindow?.available ? (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {[leftWindow, rightWindow].map((window) => (
              <article
                key={window.index}
                className="rounded-xl border border-white/[0.06] bg-black/10 p-4"
              >
                <p className="font-mono text-sm font-semibold text-cyan-200">{window.label}</p>
                <WindowMetrics metrics={window.metrics} currency={currency} />
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-4 text-xs text-white/40">
            A comparação ficará disponível após duas janelas completas.
          </p>
        )}
      </div>
    </>
  );
}
