'use client';

import { useState } from 'react';
import { refundMoney } from './refunds-visualizations';
import { Metric, type RefundReport, panel, refundPercent } from './refunds-visualizations-support';

const origins = {
  same_month: { label: 'Compras do mesmo mês', color: '#34d399' },
  previous_month: { label: 'Compras do mês anterior', color: '#22d3ee' },
  older: { label: 'Compras mais antigas', color: '#fbbf24' },
  unknown: { label: 'Data da compra não identificada', color: '#94a3b8' },
};
const monthLabel = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });
const dateLabel = (date: string) => date.split('-').reverse().join('/');

export function RefundMonthImpact({
  data,
  isPrivate,
}: {
  data?: RefundReport['month_origin'];
  isPrivate: boolean;
}) {
  const [selectedMonth, setSelectedMonth] = useState('');
  const month = data?.months.find((entry) => entry.month === selectedMonth) ?? data?.months.at(-1);
  const previous = month?.groups.find((group) => group.key === 'previous_month');
  const money = (value: number | undefined) => refundMoney(value, isPrivate);
  const percent = (value: number | null) => refundPercent(value, isPrivate);

  if (!data) {
    return (
      <output className={`${panel} block`}>
        Cruzamento mensal indisponível. Esta consulta precisa da API atualizada; a lista paginada
        não será usada para estimar valores.
      </output>
    );
  }
  if (!month || !previous) {
    return <output className={`${panel} block`}>Nenhum mês disponível neste período.</output>;
  }
  const receiptLabel = monthLabel(month.month);
  const purchaseLabel = previous.purchase_month
    ? monthLabel(previous.purchase_month)
    : 'mês anterior';
  const missingRefundAmounts = month.groups.reduce(
    (sum, group) => sum + group.missing_brl_orders,
    0,
  );
  const partialAmounts =
    missingRefundAmounts > 0 ||
    month.total.missing_fee_orders > 0 ||
    month.missing_gross_orders > 0;
  const distributionAvailable =
    !isPrivate && month.total.brl_minor > 0 && missingRefundAmounts === 0;
  return (
    <section className={`${panel} space-y-6`} aria-label="Impacto de compras de meses anteriores">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-wider text-cyan-200">
            Impacto entre meses
          </p>
          <h2 className="mt-2 text-xl font-semibold text-foreground">
            {purchaseLabel} → {receiptLabel}
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Compras do mês anterior que tiveram reembolso ou chargeback recebido neste mês. Cada
            pedido conta uma vez, pelo primeiro webhook de devolução confirmado.
          </p>
        </div>
        <label className="block min-w-0 space-y-2 text-xs text-muted-foreground">
          <span>Mês de recebimento</span>
          <select
            className="h-11 w-full rounded-lg border border-border bg-bg-elevated px-3 text-sm text-foreground"
            aria-label="Mês de recebimento"
            value={month.month}
            onChange={(event) => setSelectedMonth(event.target.value)}
          >
            {data.months.map((entry) => (
              <option key={entry.month} value={entry.month}>
                {monthLabel(entry.month)}
              </option>
            ))}
          </select>
        </label>
      </header>
      <p className="rounded-lg border border-border bg-bg-elevated p-3 text-xs leading-5 text-muted-foreground">
        <strong className="text-foreground">
          {month.partial_month ? 'Mês parcial' : 'Mês completo'}
        </strong>{' '}
        · {dateLabel(month.from)} a {dateLabel(month.to)} · São Paulo. Todos os valores e
        denominadores respeitam este recorte e os filtros acima. Não é uma projeção do restante do
        mês.
      </p>
      <dl className="grid gap-6 border-y border-border py-6 md:grid-cols-3">
        <Metric
          label="Devoluções de compras do mês anterior"
          value={money(previous.brl_minor)}
          detail={`${previous.count} devoluções · ${percent(previous.share_pct)} de todas as devoluções recebidas em ${receiptLabel}`}
        />
        <Metric
          label="Multas dessas devoluções"
          value={money(previous.fee_brl_minor)}
          detail="Multas calculadas conforme o gateway, somadas ao impacto total."
        />
        <Metric
          label="Impacto sobre o faturamento do mês"
          value={percent(previous.impact_pct)}
          detail={`${money(previous.impact_brl_minor)} de impacto total ÷ ${money(month.gross_brl_minor)} de receita bruta`}
          danger
        />
      </dl>
      <p className="text-sm text-muted-foreground">
        Sem multas, as devoluções de compras do mês anterior representam{' '}
        <strong className="text-foreground">{percent(previous.refund_pct)}</strong> do faturamento
        de {receiptLabel}.
      </p>
      {partialAmounts && (
        <output className="block text-sm text-amber-200">
          Valores parciais: {missingRefundAmounts} devoluções sem conversão BRL,{' '}
          {month.total.missing_fee_orders} multas sem cálculo completo e{' '}
          {month.missing_gross_orders} vendas sem conversão BRL. Percentuais sem base completa
          aparecem como —.
        </output>
      )}
      {!month.total.count && (
        <output className="block text-sm text-muted-foreground">
          Nenhuma devolução recebida neste mês e filtros. Percentuais sem base aparecem como —.
        </output>
      )}
      <div className="space-y-4">
        <h3 className="font-semibold text-foreground">
          De quais compras vieram as devoluções de {receiptLabel}?
        </h3>
        {distributionAvailable ? (
          <div
            className="flex h-3 overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`Participação em valor: ${month.groups.map((group) => `${origins[group.key].label}: ${percent(group.share_pct)}`).join('; ')}`}
          >
            {month.groups.map((group) => (
              <span
                key={group.key}
                style={{
                  width: `${Math.max(0, Math.min(100, group.share_pct ?? 0))}%`,
                  backgroundColor: origins[group.key].color,
                }}
              />
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {isPrivate
              ? 'Distribuição financeira oculta.'
              : 'Distribuição indisponível sem valores completos e uma base maior que zero.'}
          </p>
        )}
        <section
          className="refund-table-scroll overflow-x-auto"
          aria-label="Origem mensal e impacto das devoluções"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Enables keyboard scrolling of the financial table.
          tabIndex={0}
        >
          <table className="w-full min-w-[850px] text-left text-sm">
            <caption className="sr-only">
              Compras agrupadas pelo mês de origem, com devoluções recebidas em {receiptLabel}.
            </caption>
            <thead className="text-xs text-muted-foreground">
              <tr>
                {[
                  'Origem da compra',
                  'Pedidos',
                  'Reembolsos + CB',
                  'Multas',
                  'Impacto total',
                  '% das devoluções',
                  '% do faturamento¹',
                ].map((label, index) => (
                  <th
                    key={label}
                    scope="col"
                    className={`px-4 py-3 font-medium ${index ? 'text-right' : ''}`}
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {month.groups.map((group) => (
                <tr key={group.key} className="border-t border-border">
                  <th scope="row" className="px-4 py-4 font-normal">
                    <span
                      className="mr-2 inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: origins[group.key].color }}
                      aria-hidden="true"
                    />
                    {origins[group.key].label}
                    {group.purchase_month && (
                      <span className="mt-1 block pl-4 text-xs text-muted-foreground">
                        {monthLabel(group.purchase_month)}
                      </span>
                    )}
                  </th>
                  <td className="px-4 py-4 text-right tabular-nums">{group.count}</td>
                  <td className="px-4 py-4 text-right tabular-nums">{money(group.brl_minor)}</td>
                  <td className="px-4 py-4 text-right tabular-nums">
                    {money(group.fee_brl_minor)}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums">
                    {money(group.impact_brl_minor)}
                  </td>
                  <td className="px-4 py-4 text-right tabular-nums">{percent(group.share_pct)}</td>
                  <td className="px-4 py-4 text-right tabular-nums">{percent(group.impact_pct)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-border font-semibold">
              <tr>
                <th scope="row" className="px-4 py-4">
                  Total recebido no mês
                </th>
                <td className="px-4 py-4 text-right">{month.total.count}</td>
                <td className="px-4 py-4 text-right">{money(month.total.brl_minor)}</td>
                <td className="px-4 py-4 text-right">{money(month.total.fee_brl_minor)}</td>
                <td className="px-4 py-4 text-right">{money(month.total.impact_brl_minor)}</td>
                <td />
                <td />
              </tr>
            </tfoot>
          </table>
        </section>
        <p className="text-xs leading-5 text-muted-foreground">
          % das devoluções = valor devolvido dessa origem ÷ valor total devolvido no mês. ¹ % do
          faturamento = devoluções + multas dessa origem ÷ receita bruta do mês. Não é a taxa de
          reembolso da safra de compras. Datas de compra ausentes ou inconsistentes ficam separadas;
          devoluções sem recebimento comprovado continuam no alerta de histórico sem data, fora
          destes totais mensais.
        </p>
      </div>
    </section>
  );
}
