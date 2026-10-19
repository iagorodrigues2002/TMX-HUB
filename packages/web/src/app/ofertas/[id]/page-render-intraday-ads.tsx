'use client';

import { formatInt, formatRoas } from '@/components/dashboard/kpi-cards';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Search } from 'lucide-react';
import type { useOfertaDetailPageState } from './page-use-oferta-detail-page-state';

export function renderIntradayAds({
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
}: Pick<
  ReturnType<typeof useOfertaDetailPageState>,
  | 'intradayAdWindow'
  | 'setIntradayAdWindow'
  | 'intradayAdSearch'
  | 'setIntradayAdSearch'
  | 'adCompareLeft'
  | 'setAdCompareLeft'
  | 'adCompareRight'
  | 'setAdCompareRight'
  | 'isIntradayRange'
  | 'money'
  | 'selectedAdWindow'
  | 'filteredIntradayAds'
  | 'availableAdWindows'
  | 'leftAdWindow'
  | 'rightAdWindow'
  | 'comparedAds'
> & { intraday: NonNullable<ReturnType<typeof useOfertaDetailPageState>['intraday']> }) {
  return (
    <div className="glass-card overflow-hidden p-0">
      <header className="flex flex-wrap items-end gap-3 border-b border-white/[0.06] px-4 py-4">
        <div className="mr-auto">
          <h3 className="text-sm font-semibold text-white">Desempenho por anúncio</h3>
          <p className="mt-1 text-xs text-white/40">
            Anúncios com o mesmo nome são agrupados em uma única linha.
          </p>
        </div>
        <Label className="space-y-1">
          <span className="hud-label">Janela</span>
          <select
            value={intradayAdWindow}
            onChange={(event) => setIntradayAdWindow(event.target.value)}
            className="block h-10 min-w-[190px] rounded-md border border-white/10 bg-bg-elevated px-3 text-xs text-white"
          >
            <option value="overall">
              {isIntradayRange ? 'Acumulado do período' : 'Acumulado do dia'}
            </option>
            {intraday.windows.map((window) => (
              <option key={window.index} value={window.index} disabled={!window.adsAvailable}>
                {window.label}
                {window.adsAvailable ? '' : ' · aguardando dados'}
              </option>
            ))}
          </select>
        </Label>
        <Label className="relative min-w-[240px] space-y-1">
          <span className="hud-label">Buscar anúncio</span>
          <Search className="absolute bottom-3 left-3 h-3.5 w-3.5 text-white/35" />
          <Input
            value={intradayAdSearch}
            onChange={(event) => setIntradayAdSearch(event.target.value)}
            placeholder="Digite o nome..."
            className="h-10 pl-9"
          />
        </Label>
      </header>

      {selectedAdWindow?.adsPartial && (
        <div className="border-b border-amber-300/10 bg-amber-300/[0.04] px-4 py-3 text-xs text-amber-100/70">
          Janela parcial: o cálculo começa no primeiro checkpoint com anúncios disponível nesta
          faixa.
        </div>
      )}

      {filteredIntradayAds.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-xs">
            <thead className="bg-white/[0.03] text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
              <tr>
                <th className="px-4 py-3">Anúncio</th>
                <th className="px-3 py-3 text-right">Investido</th>
                <th className="px-3 py-3 text-right">Faturamento</th>
                <th className="px-3 py-3 text-right">Vendas</th>
                <th className="px-3 py-3 text-right">CPA</th>
                <th className="px-3 py-3 text-right">IC</th>
                <th className="px-3 py-3 text-right">CPA IC</th>
                <th className="px-4 py-3 text-right">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {filteredIntradayAds.map((ad) => (
                <tr
                  key={ad.name}
                  className="border-t border-white/[0.05] hover:bg-cyan-300/[0.025]"
                >
                  <td
                    className="max-w-[360px] truncate px-4 py-3 font-medium text-white/85"
                    title={ad.name}
                  >
                    {ad.name}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-amber-300">
                    {money(ad.spend)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-300">
                    {money(ad.revenue)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-emerald-300">
                    {formatInt(ad.sales)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-white/75">{money(ad.cpa)}</td>
                  <td className="px-3 py-3 text-right font-mono text-cyan-300">
                    {formatInt(ad.ic)}
                  </td>
                  <td className="px-3 py-3 text-right font-mono text-white/75">
                    {money(ad.icCpa)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-cyan-300">
                    {formatRoas(ad.roas)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="px-4 py-12 text-center text-xs text-white/40">
          {intradayAdSearch.trim()
            ? 'Nenhum anúncio encontrado nesta janela.'
            : 'Aguardando checkpoints com dados de anúncios para esta janela.'}
        </div>
      )}

      <section className="border-t border-cyan-300/10">
        <header className="flex flex-wrap items-end gap-3 px-4 py-4">
          <div className="mr-auto">
            <h3 className="text-sm font-semibold text-white">Comparar janelas por anúncio</h3>
            <p className="mt-1 text-xs text-white/40">
              Compare o mesmo anúncio em duas faixas de 2 horas.
            </p>
          </div>
          <Label className="space-y-1">
            <span className="hud-label">Janela A</span>
            <select
              value={adCompareLeft}
              onChange={(event) => setAdCompareLeft(event.target.value)}
              className="block h-9 min-w-[150px] rounded-md border border-white/10 bg-bg-elevated px-3 text-xs text-white"
            >
              <option value="">Anterior disponível</option>
              {availableAdWindows.map((window) => (
                <option key={window.index} value={window.index}>
                  {window.label}
                </option>
              ))}
            </select>
          </Label>
          <Label className="space-y-1">
            <span className="hud-label">Janela B</span>
            <select
              value={adCompareRight}
              onChange={(event) => setAdCompareRight(event.target.value)}
              className="block h-9 min-w-[150px] rounded-md border border-white/10 bg-bg-elevated px-3 text-xs text-white"
            >
              <option value="">Mais recente disponível</option>
              {availableAdWindows.map((window) => (
                <option key={window.index} value={window.index}>
                  {window.label}
                </option>
              ))}
            </select>
          </Label>
        </header>

        {leftAdWindow?.adsAvailable && rightAdWindow?.adsAvailable ? (
          <div className="overflow-x-auto border-t border-white/[0.05]">
            <table className="w-full min-w-[980px] text-xs">
              <thead className="bg-white/[0.03] text-[10px] font-semibold uppercase tracking-[0.14em] text-white/50">
                <tr>
                  <th rowSpan={2} className="px-4 py-3 text-left">
                    Anúncio
                  </th>
                  <th
                    colSpan={4}
                    className="border-l border-white/[0.05] px-3 py-2 text-center text-cyan-200"
                  >
                    {leftAdWindow.label}
                  </th>
                  <th
                    colSpan={4}
                    className="border-l border-white/[0.05] px-3 py-2 text-center text-emerald-200"
                  >
                    {rightAdWindow.label}
                  </th>
                </tr>
                <tr>
                  {[
                    { key: 'left-investment', label: 'Invest.' },
                    { key: 'left-sales', label: 'Vendas' },
                    { key: 'left-cpa', label: 'CPA' },
                    { key: 'left-roas', label: 'ROAS' },
                    { key: 'right-investment', label: 'Invest.' },
                    { key: 'right-sales', label: 'Vendas' },
                    { key: 'right-cpa', label: 'CPA' },
                    { key: 'right-roas', label: 'ROAS' },
                  ].map((column) => (
                    <th
                      key={column.key}
                      className="border-l border-white/[0.05] px-3 py-2 text-right"
                    >
                      {column.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparedAds.map((row) => (
                  <tr key={row.name} className="border-t border-white/[0.05]">
                    <td
                      className="max-w-[300px] truncate px-4 py-3 font-medium text-white/85"
                      title={row.name}
                    >
                      {row.name}
                    </td>
                    <td className="border-l border-white/[0.05] px-3 py-3 text-right font-mono text-amber-300">
                      {money(row.left?.spend)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-white/75">
                      {formatInt(row.left?.sales)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-white/75">
                      {money(row.left?.cpa)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-cyan-300">
                      {formatRoas(row.left?.roas)}
                    </td>
                    <td className="border-l border-white/[0.05] px-3 py-3 text-right font-mono text-amber-300">
                      {money(row.right?.spend)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-white/75">
                      {formatInt(row.right?.sales)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-white/75">
                      {money(row.right?.cpa)}
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-emerald-300">
                      {formatRoas(row.right?.roas)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="border-t border-white/[0.05] px-4 py-8 text-center text-xs text-white/40">
            A comparação por anúncio ficará disponível após duas janelas com checkpoints de
            anúncios.
          </p>
        )}
      </section>
    </div>
  );
}
