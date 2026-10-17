import type { RefundRanking, apiClient } from '@/lib/api-client';
import React, { useState } from 'react';
export type RefundReport = Awaited<ReturnType<typeof apiClient.getRefundsDashboard>>;
export function refundMoney(v: number | null | undefined, hidden: boolean) {
  return hidden
    ? '****'
    : v == null
      ? '—'
      : new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL',
        }).format(v / 100);
}
export function refundPercent(v: number | null | undefined, hidden: boolean) {
  return hidden
    ? '****'
    : v == null
      ? '—'
      : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}
const panel = 'refund-panel min-w-0 rounded-2xl border border-white/10 bg-bg-elevated/70 p-5 sm:p-7';
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
        <div className="mt-5 overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label="Devoluções por mês da compra, role horizontalmente para ver todas as colunas">
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
                  <th key={h} scope="col" className={`bg-white/[0.025] px-4 py-4 font-medium text-white/70 ${index ? 'text-right' : 'text-left'}`}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.cohorts.map((c) => (
                <tr key={c.month} className="border-b border-white/5 transition-colors hover:bg-white/[0.035] [&>td:not(:first-child)]:text-right">
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
        </div>
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
          Data do primeiro recebimento do webhook de reembolso ou chargeback no TMX menos
          a data da compra, vinculadas ao mesmo pedido, gateway e conta. Reenvios posteriores
          não alteram o prazo. Considera as devoluções contabilizadas no período selecionado.
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
function Metric({
  label,
  value,
  detail,
  danger = false,
}: {
  label: string;
  value: string;
  detail: string;
  danger?: boolean;
}) {
  return (
    <div className={`refund-metric min-w-0 ${label === 'Impacto total' ? 'refund-impact' : ''}`}>
      <dt className="text-sm font-medium text-white/65">{label}</dt>
      <dd
        className={`mt-3 break-words text-[clamp(1.4rem,2vw,2rem)] font-semibold leading-tight tracking-tight tabular-nums ${danger ? 'text-rose-300' : 'text-white'}`}
      >
        {value}
      </dd>
      <p className="mt-2 text-xs leading-5 text-white/65">{detail}</p>
    </div>
  );
}
function Change({
  label,
  value,
  suffix,
  hidden,
}: {
  label: string;
  value: number | null;
  suffix: string;
  hidden: boolean;
}) {
  return (
    <div>
      <p className="text-sm text-white/60">{label}</p>
      <p
        className={`mt-2 text-2xl font-semibold tracking-tight tabular-nums ${hidden ? 'text-white/60' : value != null && value < 0 ? 'text-emerald-300' : value != null && value > 0 ? 'text-rose-300' : 'text-white/60'}`}
      >
        {hidden
          ? '****'
          : value == null
            ? '—'
            : `${value > 0 ? '+' : ''}${value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${suffix}`}
      </p>
      <p className="mt-1 text-xs text-white/50">
        {value == null
          ? 'Sem base anterior comparável'
          : hidden
            ? 'Comparação oculta'
            : value < 0
              ? 'Diminuiu'
              : value > 0
                ? 'Aumentou'
                : 'Sem alteração'}
      </p>
    </div>
  );
}
type Point = {
  date: string;
  count: number;
  brl_minor: number;
  moving_average_brl_minor: number;
};
export function RefundTrend({
  points,
  isPrivate,
  interval,
}: {
  points: Point[];
  isPrivate: boolean;
  interval: 'day' | 'week' | 'month';
}) {
  if (!points.length) return <Empty />;
  if (isPrivate)
    return (
      <div className="grid min-h-64 place-items-center text-white/60">
        **** · gráfico financeiro oculto pelo modo de privacidade
      </div>
    );
  const w = 900;
  const h = 280;
  const pad = 52;
  const left = 96;
  const max = Math.max(1, ...points.flatMap((p) => [p.brl_minor, p.moving_average_brl_minor]));
  const x = (i: number) => left + ((i + 0.5) * (w - left - pad)) / points.length;
  const y = (v: number) => h - pad - (v / max) * (h - 2 * pad);
  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.moving_average_brl_minor)}`)
    .join(' ');
  return (
    <figure className="mt-6">
      <div className="overflow-x-auto rounded-xl border border-white/5 bg-white/[0.015] px-2 pt-4" tabIndex={0} role="region" aria-label="Gráfico de devoluções, dados detalhados disponíveis na tabela abaixo">
        <svg
          role="img"
          aria-label="Devoluções unificadas e média móvel"
          viewBox={`0 0 ${w} ${h}`}
          className="refund-chart-reveal w-full min-w-[520px]"
        >
          <title>Devoluções unificadas e média móvel</title>
          {[0, 0.5, 1].map((fraction) => (
            <g key={fraction}>
              <line x1={left} x2={w - pad} y1={y(max * fraction)} y2={y(max * fraction)} stroke="currentColor" opacity=".09" strokeDasharray="4 6" />
              <text x={left - 12} y={y(max * fraction) + 4} textAnchor="end" fill="#a5b6be" fontSize="11">
                {refundMoney(max * fraction, false)}
              </text>
            </g>
          ))}
          <line
            x1={left}
            x2={w - pad}
            y1={h - pad}
            y2={h - pad}
            stroke="currentColor"
            opacity=".2"
          />
          {points.map((p, i) => (
            <rect
              key={p.date}
              className="refund-bar-reveal"
              style={{ animationDelay: `${Math.min(i * 18, 360)}ms` }}
              x={x(i) - ((w - left - pad) / points.length) * 0.32}
              y={y(p.brl_minor)}
              width={Math.max(1, ((w - left - pad) / points.length) * 0.64)}
              height={Math.max(0, h - pad - y(p.brl_minor))}
              rx="2"
              fill="#fb7185"
            >
              <title>{`${p.date}: ${refundMoney(p.brl_minor, false)} · ${p.count} devoluções`}</title>
            </rect>
          ))}
          <path className="refund-chart-reveal" d={line} fill="none" stroke="#67e8f9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {points
            .filter(
              (_, i) => i === 0 || i === points.length - 1 || i === Math.floor(points.length / 2),
            )
            .map((p) => (
              <text
                key={p.date}
                x={x(points.indexOf(p))}
                y={h - 8}
                textAnchor="middle"
                fill="#a5b6be"
                fontSize="12"
              >
                {p.date.slice(0, 10).split('-').reverse().join('/')}
              </text>
            ))}
        </svg>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-white/60">
        <span className="inline-flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-2.5 w-2.5 rounded-sm bg-rose-400" /> Reembolsos e chargebacks
        </span>
        <span>
          <span className="text-cyan-200">━</span> Média móvel (
          {interval === 'day' ? '7 dias' : interval === 'week' ? '7 semanas' : '7 meses'})
        </span>
      </figcaption>
      <details className="mt-5 border-t border-white/10 pt-2 text-xs text-white/70">
        <summary className="cursor-pointer rounded-lg py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">Ver valores do gráfico em tabela</summary>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left tabular-nums [&_th:not(:first-child)]:text-right [&_td:not(:first-child)]:text-right">
            <thead>
              <tr>
                <th className="py-2">Período</th>
                <th>Devoluções</th>
                <th>Valor</th>
                <th>Média móvel</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.date}>
                  <td className="py-2">{p.date.slice(0, 10).split('-').reverse().join('/')}</td>
                  <td>{p.count}</td>
                  <td>{refundMoney(p.brl_minor, false)}</td>
                  <td>{refundMoney(p.moving_average_brl_minor, false)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
export function RefundRankingTable({
  rows,
  isPrivate,
}: {
  rows: RefundRanking[];
  isPrivate: boolean;
}) {
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-white/10" tabIndex={0} role="region" aria-label="Ranking de devoluções, role horizontalmente para ver todas as colunas">
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
              <th key={h} scope="col" className={`bg-white/[0.025] px-4 py-4 font-medium text-white/70 ${index ? 'text-right' : 'text-left'}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-white/5 transition-colors hover:bg-white/[0.035]">
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
    </div>
  );
}
type Delay = {
  mean_days: number | null;
  median_days: number | null;
  sample_count?: number;
  missing_paid_at?: number;
  missing_reversal_at?: number;
  negative_delay_orders?: number;
  buckets: Array<{ label: string; count: number }>;
};
export function RefundDelay({
  delay,
  isPrivate,
  basis = 'effective',
}: {
  delay: Delay;
  isPrivate: boolean;
  basis?: 'effective' | 'observed';
}) {
  const sampleCount = delay.sample_count ?? delay.buckets.reduce((sum, b) => sum + b.count, 0);
  const hasSample = sampleCount > 0;
  const days = (v: number | null) =>
    isPrivate
      ? '****'
      : v == null
        ? '—'
        : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} dias`;
  return (
    <div className="mt-5">
      <div className="grid gap-6 lg:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.6fr)]">
        <div className="min-w-0 border-b border-white/10 pb-5 lg:border-b-0 lg:border-r lg:pr-7">
          <dl className="grid grid-cols-2 gap-4 lg:grid-cols-1">
            <div>
              <dt className="text-sm text-white/70">Tempo médio</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums text-cyan-200">
                {days(hasSample ? delay.mean_days : null)}
              </dd>
            </div>
            <div>
              <dt className="text-sm text-white/70">Mediana</dt>
              <dd className="mt-2 text-2xl font-semibold tabular-nums text-white">
                {days(hasSample ? delay.median_days : null)}
              </dd>
            </div>
          </dl>
          <p className="mt-4 border-t border-white/10 pt-3 text-xs leading-5 text-white/60">
            A mediana é o prazo central: metade das devoluções acontece até esse tempo.
          </p>
          <p className="mt-3 text-sm text-white/80">
            <span className="font-semibold tabular-nums">
              {isPrivate ? '****' : sampleCount.toLocaleString('pt-BR')}
            </span>{' '}
            {basis === 'observed' ? 'notificações com intervalo válido' : 'devoluções com intervalo válido'}
          </p>
        </div>
        <div className="min-w-0">
          <h3 className="text-sm font-medium text-white">Distribuição por prazo</h3>
          <p className="mt-1 text-xs leading-5 text-white/60">
            Participação de cada faixa nas devoluções com intervalo válido.
          </p>
          {isPrivate ? (
            <p className="mt-4 rounded-lg border border-white/10 px-4 py-8 text-center text-sm text-white/60">
              Distribuição oculta pelo modo de privacidade.
            </p>
          ) : !hasSample ? (
            <div className="mt-4 rounded-lg border border-dashed border-white/15 px-4 py-6">
              <p className="text-sm font-medium text-white/85">Sem intervalo válido neste filtro</p>
              <p className="mt-2 max-w-xl text-sm leading-6 text-white/60">
                É preciso identificar a data da compra e a do primeiro recebimento do webhook no mesmo pedido.
                Sem esse vínculo, o prazo não é calculado como zero.
              </p>
            </div>
          ) : (
            <ul className="mt-4 space-y-4" aria-label={basis === 'observed' ? 'Distribuição do tempo entre compra e recebimento da notificação' : 'Distribuição do tempo entre compra e devolução'}>
              {delay.buckets.map((b) => {
                const share = (b.count / sampleCount) * 100;
                return (
                  <li key={b.label}>
                    <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-sm">
                      <span className="text-white/80">{b.label}</span>
                      <span className="tabular-nums text-white/65">
                        {b.count.toLocaleString('pt-BR')} {basis === 'observed' ? 'notificações' : 'devoluções'}{' '}
                        <span className="font-medium text-cyan-200">
                          ({refundPercent(share, false)})
                        </span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10" aria-hidden="true">
                      <div
                        className="refund-bar-reveal h-full rounded-full bg-cyan-300/75"
                        style={{ width: `${Math.min(100, Math.max(0, share))}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
      {(Boolean(delay.missing_paid_at) || Boolean(delay.missing_reversal_at) || Boolean(delay.negative_delay_orders)) && (
        <p className="mt-5 rounded-lg border border-amber-200/20 bg-amber-200/5 px-4 py-3 text-sm leading-6 text-amber-100">
          Datas ausentes ou inconsistentes foram excluídas apenas desta análise de prazo.
          Os valores dessas devoluções permanecem no resumo financeiro.
          {!isPrivate && (
            <span className="mt-1 block tabular-nums">
              Sem data da compra: {delay.missing_paid_at ?? 0}. {basis === 'observed' ? 'Sem data do recebimento' : 'Sem data da devolução'}: {delay.missing_reversal_at ?? 0}.
              Intervalos negativos: {delay.negative_delay_orders ?? 0}.
            </span>
          )}
        </p>
      )}
    </div>
  );
}
function Empty() {
  return (
    <p className="py-8 text-center text-sm text-white/50">Nenhum dado disponível neste filtro.</p>
  );
}
