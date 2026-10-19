import { useState } from 'react';
import { refundMoney } from './refunds-visualizations';
import { RefundDelay } from './refunds-visualizations-refund-delay';
import { RefundRankingTable } from './refunds-visualizations-refund-ranking-table';
import { RefundTrend } from './refunds-visualizations-refund-trend';
import {
  Change,
  Empty,
  Metric,
  type RefundReport,
  panel,
  refundPercent,
} from './refunds-visualizations-support';

export function RefundAnalytics({
  data,
  isPrivate,
  interval,
  onIntervalChange,
}: {
  data: RefundReport;
  isPrivate: boolean;
  interval: 'day' | 'week' | 'month';
  onIntervalChange: (v: 'day' | 'week' | 'month') => void;
}) {
  const [ranking, setRanking] = useState<'offers' | 'gateways' | 'products'>('offers');
  const t = data.totals;
  const pick = (v: number | undefined) => refundMoney(v, isPrivate);
  return (
    <div className="refund-analytics">
      <section id="refund-overview" className={`${panel} refund-summary`}>
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-cyan-200">Visão financeira</h2>
          <span className="text-xs text-white/60">Período e filtros selecionados</span>
        </div>
        <dl className="grid gap-x-8 gap-y-7 sm:grid-cols-2 xl:grid-cols-4">
          <Metric
            label="Faturamento bruto"
            value={pick(t.gross_brl_minor)}
            detail={`${t.sales} vendas no período`}
          />
          <Metric
            label="Reembolsos e chargebacks"
            value={pick(t.brl_minor)}
            detail={`${t.count} devoluções · ${refundPercent(t.rate_pct, isPrivate)} do faturamento`}
            danger
          />
          <Metric
            label="Multas dos gateways"
            value={pick(t.fee_brl_minor)}
            detail="Conforme configuração de cada gateway"
          />
          <Metric
            label="Impacto total"
            value={pick(t.impact_brl_minor)}
            detail={`${refundPercent(t.impact_pct, isPrivate)} do faturamento, incluindo multas`}
            danger
          />
        </dl>
        <p className="mt-6 border-t border-white/10 pt-4 text-xs leading-5 text-white/65">
          Percentual = devoluções ocorridas no período ÷ faturamento das vendas no período. Pode
          incluir devoluções de compras antigas e superar 100%. Para avaliar a qualidade das
          compras, consulte os meses de compra abaixo.
        </p>
        {(t.missing_brl_orders > 0 || t.missing_fee_orders > 0) && (
          <output className="mt-4 block rounded-xl border border-amber-200/20 bg-amber-200/5 px-4 py-3 text-sm leading-6 text-amber-200">
            Total parcial: {t.missing_brl_orders} pedidos sem conversão BRL e {t.missing_fee_orders}{' '}
            ocorrências sem multa calculável. Os valores exibidos são apenas a parcela conhecida.
          </output>
        )}
      </section>
      <section className={`${panel} refund-comparison`}>
        <h2 className="text-lg font-semibold text-white">Comparação com o período anterior</h2>
        <p className="mt-1 text-xs text-white/50">
          {data.comparison.previous_from} a {data.comparison.previous_to} · mesma duração
        </p>
        {(data.comparison.previous.missing_brl_orders > 0 ||
          data.comparison.previous.missing_fee_orders > 0) && (
          <p className="mt-2 text-xs text-amber-200">
            O período anterior tem conversões ou multas incompletas. Comparações sem base completa
            aparecem como —.
          </p>
        )}
        <div className="mt-5 grid gap-6 sm:grid-cols-3">
          <Metric
            label="Devoluções anteriores"
            value={pick(data.comparison.previous.brl_minor)}
            detail={`${data.comparison.previous.count} devoluções`}
          />
          <Change
            label="Variação do valor devolvido"
            value={data.comparison.amount_change_pct}
            suffix="%"
            hidden={isPrivate}
          />
          <Change
            label="Variação sobre o faturamento"
            value={data.comparison.rate_change_pp}
            suffix="p.p."
            hidden={isPrivate}
          />
        </div>
      </section>
      <section id="refund-evolution" className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Evolução das devoluções</h2>
            <p className="mt-1 text-xs text-white/50">
              Valores unificados e média móvel para observar a tendência.
            </p>
          </div>
          <select
            aria-label="Agrupar evolução"
            className="h-11 rounded-lg border border-white/20 bg-bg-elevated px-3 text-sm text-white"
            value={interval}
            onChange={(e) => onIntervalChange(e.target.value as typeof interval)}
          >
            <option value="day">Por dia</option>
            <option value="week">Por semana</option>
            <option value="month">Por mês</option>
          </select>
        </div>
        <RefundTrend points={data.trend} isPrivate={isPrivate} interval={interval} />
      </section>
      <section className={`${panel} refund-breakdown`}>
        <h2 className="text-lg font-semibold text-white">Devoluções por mês da compra</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-white/50">
          Compras do intervalo selecionado agrupadas por mês, com devoluções observadas até hoje. Os
          primeiros 90 dias são uma referência operacional de maturação, não uma garantia de
          encerramento. Meses recentes não são diretamente comparáveis aos antigos.
        </p>
        <section
          className="mt-5 overflow-x-auto rounded-xl border border-white/10"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: The horizontal table scroll region must be keyboard-focusable.
          tabIndex={0}
          aria-label="Devoluções por mês da compra, role horizontalmente para ver todas as colunas"
        >
          <table className="w-full min-w-[680px] text-sm tabular-nums">
            <caption className="sr-only">Vendas e devoluções agrupadas pelo mês da compra</caption>
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-white/50">
                {[
                  'Mês da compra',
                  'Vendas',
                  'Faturamento bruto',
                  'Devoluções',
                  'Valor devolvido',
                  '% do faturamento',
                ].map((h, index) => (
                  <th
                    key={h}
                    scope="col"
                    className={`bg-white/[0.025] px-4 py-4 font-medium text-white/70 ${index ? 'text-right' : 'text-left'}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.cohorts.map((c) => (
                <tr
                  key={c.month}
                  className="border-b border-white/5 transition-colors hover:bg-white/[0.035] [&>td:not(:first-child)]:text-right"
                >
                  <td className="px-3 py-3 text-white">
                    {c.month}
                    {c.immature && (
                      <span className="ml-2 whitespace-nowrap rounded border border-amber-200/20 px-2 py-1 text-xs text-amber-200">
                        Em maturação
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-3">{c.sales}</td>
                  <td className="px-3 py-3">{pick(c.gross_brl_minor)}</td>
                  <td className="px-3 py-3">{c.count}</td>
                  <td className="px-3 py-3 text-danger">{pick(c.brl_minor)}</td>
                  <td className="px-3 py-3">{refundPercent(c.rate_pct, isPrivate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data.cohorts.length && <Empty />}
        </section>
      </section>
      <section className={`${panel} refund-breakdown`}>
        <div className="flex flex-wrap justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-white">Onde estão as devoluções</h2>
            <p className="mt-1 text-xs text-white/50">
              Mesmo período e filtros do resumo. Ordenado pelo valor devolvido.
            </p>
          </div>
          <select
            aria-label="Agrupar ranking"
            className="h-11 rounded-lg border border-white/20 bg-bg-elevated px-3 text-sm text-white"
            value={ranking}
            onChange={(e) => setRanking(e.target.value as typeof ranking)}
          >
            <option value="offers">Por oferta</option>
            <option value="gateways">Por gateway</option>
            <option value="products">Por produto</option>
          </select>
        </div>
        <RefundRankingTable rows={data.rankings[ranking]} isPrivate={isPrivate} />
      </section>
      <section id="refund-timing" className={panel}>
        <h2 className="text-lg font-semibold text-white">Tempo entre compra e devolução</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-white/60">
          Data do primeiro recebimento do webhook de reembolso ou chargeback no TMX menos a data da
          compra, vinculadas ao mesmo pedido, gateway e conta. Reenvios posteriores não alteram o
          prazo. Considera as devoluções contabilizadas no período selecionado.
        </p>
        <p className="mt-2 text-xs leading-5 text-white/60">
          Atrasos no envio original do gateway entram neste intervalo. A base é o recebimento
          registrado pelo TMX, não a data contida no payload. Valores financeiros preservados.
        </p>
        <RefundDelay delay={data.delay} isPrivate={isPrivate} basis="observed" />
      </section>
    </div>
  );
}
