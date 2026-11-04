'use client';

import { KpiGrid, formatInt, formatPercent, formatRoas } from '@/components/dashboard/kpi-cards';
import { Input } from '@/components/ui/input';
import { Search } from 'lucide-react';
import type { useOfertaDetailPageState } from './page-use-oferta-detail-page-state';

export function renderSnapshotMetrics({
  adSearch,
  setAdSearch,
  snapshotsQuery,
  data,
  adsetTotals,
  adTotals,
  currency,
  money,
}: Pick<
  ReturnType<typeof useOfertaDetailPageState>,
  | 'adSearch'
  | 'setAdSearch'
  | 'snapshotsQuery'
  | 'data'
  | 'adsetTotals'
  | 'adTotals'
  | 'currency'
  | 'money'
> & { data: NonNullable<ReturnType<typeof useOfertaDetailPageState>['data']> }) {
  return (
    <div className="space-y-6">
      {snapshotsQuery.isError && (
        <output
          aria-live="polite"
          className="block rounded-xl border border-warning/25 bg-warning/[0.07] px-4 py-3 text-sm text-warning"
        >
          Não foi possível atualizar agora. Exibindo as últimas métricas carregadas.
        </output>
      )}
      <KpiGrid metrics={data.totals} currency={currency} />

      <section className="glass-card overflow-hidden p-0">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold text-foreground">Anúncios</h3>
            <p className="mt-0.5 text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              Dados UTMify em nível de ad
            </p>
          </div>
          <div className="relative w-full sm:w-[280px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={adSearch}
              onChange={(event) => setAdSearch(event.target.value)}
              placeholder="Buscar anúncio pelo nome…"
              className="h-9 pl-9"
            />
          </div>
        </header>
        {adTotals.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {adSearch
              ? 'Nenhum anúncio corresponde à busca.'
              : 'Os anúncios aparecerão após a primeira sincronização UTMify.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-xs">
              <thead className="bg-muted text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Anúncio</th>
                  <th className="px-3 py-2 text-right">Investido</th>
                  <th className="px-3 py-2 text-right">Faturamento</th>
                  <th className="px-3 py-2 text-right">Vendas</th>
                  <th className="px-3 py-2 text-right">IC</th>
                  <th className="px-3 py-2 text-right">CPA</th>
                  <th className="px-3 py-2 text-right">ROAS</th>
                  <th className="px-3 py-2 text-right">CTR</th>
                </tr>
              </thead>
              <tbody>
                {adTotals.map((ad) => {
                  const cpa = ad.sales > 0 ? ad.spend / ad.sales : null;
                  const roas = ad.spend > 0 ? ad.revenue / ad.spend : null;
                  const ctr = ad.impressions > 0 ? ad.clicks / ad.impressions : null;
                  return (
                    <tr key={ad.name} className="border-t border-border">
                      <td className="max-w-[420px] px-3 py-2 text-foreground" title={ad.name}>
                        {ad.name}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-warning">
                        {money(ad.spend)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-success">
                        {money(ad.revenue)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">
                        {formatInt(ad.sales)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-primary">
                        {formatInt(ad.ic)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">
                        {money(cpa)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-primary">
                        {formatRoas(roas)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">
                        {formatPercent(ctr)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="glass-card overflow-hidden p-0">
        <header className="flex items-baseline justify-between border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold text-foreground">Série diária</h3>
          <span className="hud-label">{data.snapshots.length} dia(s)</span>
        </header>
        {data.snapshots.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Nenhum dado sincronizado nesse período. Verifique a conexão UTMify da oferta.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-xs">
              <thead className="bg-muted text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Data</th>
                  <th className="px-3 py-2 text-right">Vendas</th>
                  <th className="px-3 py-2 text-right">Faturamento</th>
                  <th className="px-3 py-2 text-right">Investido</th>
                  <th className="px-3 py-2 text-right">IC</th>
                  <th className="px-3 py-2 text-right">CPA</th>
                  <th className="px-3 py-2 text-right">CPA IC</th>
                  <th className="px-3 py-2 text-right">Conv.</th>
                  <th className="px-3 py-2 text-right">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {data.snapshots.map((s) => (
                  <tr key={s.date} className="border-t border-border">
                    <td className="px-3 py-2 font-mono text-foreground">{s.date}</td>
                    <td className="px-3 py-2 text-right font-mono text-success">
                      {formatInt(s.sales)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-success">
                      {money(s.revenue)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-warning">
                      {money(s.spend)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">
                      {formatInt(s.ic)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">
                      {money(s.metrics.cpa)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">
                      {money(s.metrics.icCpa)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-foreground">
                      {formatPercent(s.metrics.conversionRate)}
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-primary">
                      {formatRoas(s.metrics.roas)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {adsetTotals.length > 0 && (
        <section className="glass-card overflow-hidden p-0">
          <header className="flex items-baseline justify-between border-b border-border px-4 py-3">
            <h3 className="text-sm font-semibold text-foreground">Adsets</h3>
            <span className="hud-label">
              {adsetTotals.length} no período · ranqueado por faturamento
            </span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-xs">
              <thead className="bg-muted text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Adset</th>
                  <th className="px-3 py-2 text-right">Vendas</th>
                  <th className="px-3 py-2 text-right">Faturamento</th>
                  <th className="px-3 py-2 text-right">Investido</th>
                  <th className="px-3 py-2 text-right">IC</th>
                  <th className="px-3 py-2 text-right">CPA</th>
                  <th className="px-3 py-2 text-right">ROAS</th>
                </tr>
              </thead>
              <tbody>
                {adsetTotals.map((a) => {
                  const cpa = a.sales > 0 ? a.spend / a.sales : null;
                  const roas = a.spend > 0 ? a.revenue / a.spend : null;
                  return (
                    <tr key={a.name} className="border-t border-border">
                      <td className="max-w-[280px] truncate px-3 py-2 text-foreground">{a.name}</td>
                      <td className="px-3 py-2 text-right font-mono text-success">
                        {formatInt(a.sales)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-success">
                        {money(a.revenue)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-warning">
                        {money(a.spend)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">
                        {formatInt(a.ic)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-foreground">
                        {money(cpa)}
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-primary">
                        {formatRoas(roas)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
