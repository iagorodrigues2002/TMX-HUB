'use client';

import { DataState } from '@/components/ui/data-state';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { SAO_PAULO_TIME_ZONE, todayIso } from '@/lib/date-range';
import { Clock3 } from 'lucide-react';
import { renderIntradayAds } from './page-render-intraday-ads';
import { renderIntradayOverview } from './page-render-intraday-overview';
import type { useOfertaDetailPageState } from './page-use-oferta-detail-page-state';

export function renderIntradaySection({
  from,
  to,
  compareLeft,
  setCompareLeft,
  compareRight,
  setCompareRight,
  intradayMode,
  setIntradayMode,
  setIntradayPeriod,
  intradayFrom,
  intradayTo,
  intradayAdWindow,
  setIntradayAdWindow,
  intradayAdSearch,
  setIntradayAdSearch,
  adCompareLeft,
  setAdCompareLeft,
  adCompareRight,
  setAdCompareRight,
  isIntradayRange,
  intradayQuery,
  intraday,
  currency,
  money,
  availableWindows,
  leftWindow,
  rightWindow,
  currentWindow,
  selectedAdWindow,
  filteredIntradayAds,
  availableAdWindows,
  leftAdWindow,
  rightAdWindow,
  comparedAds,
}: Pick<
  ReturnType<typeof useOfertaDetailPageState>,
  | 'from'
  | 'to'
  | 'compareLeft'
  | 'setCompareLeft'
  | 'compareRight'
  | 'setCompareRight'
  | 'intradayMode'
  | 'setIntradayMode'
  | 'setIntradayPeriod'
  | 'intradayFrom'
  | 'intradayTo'
  | 'intradayAdWindow'
  | 'setIntradayAdWindow'
  | 'intradayAdSearch'
  | 'setIntradayAdSearch'
  | 'adCompareLeft'
  | 'setAdCompareLeft'
  | 'adCompareRight'
  | 'setAdCompareRight'
  | 'isIntradayRange'
  | 'intradayQuery'
  | 'intraday'
  | 'currency'
  | 'money'
  | 'availableWindows'
  | 'leftWindow'
  | 'rightWindow'
  | 'currentWindow'
  | 'selectedAdWindow'
  | 'filteredIntradayAds'
  | 'availableAdWindows'
  | 'leftAdWindow'
  | 'rightAdWindow'
  | 'comparedAds'
>) {
  return (
    <section className="mt-8 space-y-4 border-t border-cyan-300/10 pt-8">
      <header>
        <div>
          <div className="flex items-center gap-2">
            <Clock3 className="h-4 w-4 text-cyan-300" />
            <h2 className="text-[16px] font-semibold text-white">Janelas intradiárias</h2>
          </div>
          <p className="mt-1 text-xs text-white/45">
            Checkpoints a cada 30 minutos · janelas fixas de 2 horas · horário de São Paulo ·
            selecione um período pra somar vários dias
          </p>
        </div>
      </header>

      <DateRangeFilter
        value={{ from: intradayFrom, to: intradayTo }}
        onChange={(range) => {
          setIntradayPeriod(range);
          setCompareLeft('');
          setCompareRight('');
          setIntradayAdWindow('overall');
          setAdCompareLeft('');
          setAdCompareRight('');
        }}
        max={todayIso()}
        status={
          intraday?.updatedAt ? (
            <span className="hud-label pb-2.5">
              Atualizado{' '}
              {new Date(intraday.updatedAt).toLocaleTimeString('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                timeZone: SAO_PAULO_TIME_ZONE,
              })}
            </span>
          ) : null
        }
      />

      <div
        className="relative inline-grid w-fit grid-cols-2 rounded-lg border border-white/10 bg-black/15 p-1"
        role="tablist"
        aria-label="Visualização intradiária"
      >
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-1 left-1 h-px w-[calc(50%-0.25rem)] bg-cyan-300 shadow-[0_0_8px_rgba(34,211,238,0.6)] transition-transform duration-[180ms] ease-out motion-reduce:transition-none ${intradayMode === 'ads' ? 'translate-x-full' : 'translate-x-0'}`}
        />
        <button
          type="button"
          onClick={() => setIntradayMode('overview')}
          role="tab"
          aria-selected={intradayMode === 'overview'}
          className={`min-h-11 rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors duration-[180ms] ${intradayMode === 'overview' ? 'bg-cyan-300/10 text-cyan-200' : 'text-white/45 hover:text-white/75'}`}
        >
          Visão geral
        </button>
        <button
          type="button"
          onClick={() => setIntradayMode('ads')}
          role="tab"
          aria-selected={intradayMode === 'ads'}
          className={`min-h-11 rounded-md px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition-colors duration-[180ms] ${intradayMode === 'ads' ? 'bg-cyan-300/10 text-cyan-200' : 'text-white/45 hover:text-white/75'}`}
        >
          Por anúncios
        </button>
      </div>

      {intradayQuery.isLoading ? (
        <DataState variant="loading" title="Carregando janelas intradiárias…" />
      ) : intradayQuery.isError && !intraday ? (
        <DataState
          variant="error"
          title="Não foi possível carregar as janelas intradiárias"
          description="As demais métricas da oferta continuam disponíveis acima."
          isRetrying={intradayQuery.isFetching}
          onRetry={() => void intradayQuery.refetch()}
        />
      ) : !intraday ? (
        <DataState
          variant="empty"
          title="Coleta intradiária ainda não iniciada"
          description="Os dados aparecerão após a próxima sincronização UTMify."
        />
      ) : intradayMode === 'overview' ? (
        renderIntradayOverview({
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
        })
      ) : (
        renderIntradayAds({
          intradayAdWindow,
          setIntradayAdWindow,
          intradayAdSearch,
          setIntradayAdSearch,
          adCompareLeft,
          setAdCompareLeft,
          adCompareRight,
          setAdCompareRight,
          isIntradayRange,
          intraday,
          money,
          selectedAdWindow,
          filteredIntradayAds,
          availableAdWindows,
          leftAdWindow,
          rightAdWindow,
          comparedAds,
        })
      )}
    </section>
  );
}
