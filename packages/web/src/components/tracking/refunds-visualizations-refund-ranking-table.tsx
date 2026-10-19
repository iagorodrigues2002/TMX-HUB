import type { RefundRanking } from '@/lib/api-client';
import { refundMoney } from './refunds-visualizations';
import { Empty, refundPercent } from './refunds-visualizations-support';

export function RefundRankingTable({
  rows,
  isPrivate,
}: {
  rows: RefundRanking[];
  isPrivate: boolean;
}) {
  return (
    <section
      className="mt-5 overflow-x-auto rounded-xl border border-white/10"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: The horizontal table scroll region must be keyboard-focusable.
      tabIndex={0}
      aria-label="Ranking de devoluções, role horizontalmente para ver todas as colunas"
    >
      <table className="w-full min-w-[820px] text-sm tabular-nums [&_td:not(:first-child)]:text-right">
        <caption className="sr-only">Ranking por valor devolvido no período selecionado</caption>
        <thead>
          <tr className="border-b border-white/10 text-left text-xs text-white/50">
            {[
              'Nome',
              'Vendas',
              'Faturamento bruto',
              'Devoluções',
              'Valor devolvido',
              '% do faturamento',
              'Multas',
              'Impacto total',
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
          {rows.map((r) => (
            <tr
              key={r.key}
              className="border-b border-white/5 transition-colors hover:bg-white/[0.035]"
            >
              <td className="max-w-72 break-words px-3 py-3 text-white">{r.label}</td>
              <td className="px-3 py-3">{r.sales}</td>
              <td className="whitespace-nowrap px-3 py-3">
                {refundMoney(r.gross_brl_minor, isPrivate)}
              </td>
              <td className="px-3 py-3">{r.count}</td>
              <td className="whitespace-nowrap px-3 py-3 text-danger">
                {refundMoney(r.brl_minor, isPrivate)}
              </td>
              <td className="px-3 py-3">{refundPercent(r.rate_pct, isPrivate)}</td>
              <td className="whitespace-nowrap px-3 py-3">
                {refundMoney(r.fee_brl_minor, isPrivate)}
              </td>
              <td className="whitespace-nowrap px-3 py-3 text-danger">
                {refundMoney(r.impact_brl_minor, isPrivate)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!rows.length && <Empty />}
    </section>
  );
}
