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
const panel = 'rounded-xl border border-white/10 bg-bg-elevated/70 p-5';
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
    <>
      <section className={panel}>
        <dl className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
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
        <p className="mt-5 border-t border-white/10 pt-3 text-xs leading-5 text-white/50">
          Percentual = devoluções ocorridas no período ÷ faturamento das vendas no período. Pode
          incluir devoluções de compras antigas e superar 100%. Para avaliar a qualidade das
          compras, consulte os meses de compra abaixo.
        </p>
        {(t.missing_brl_orders > 0 || t.missing_fee_orders > 0) && (
          <output className="mt-3 block text-sm text-amber-200">
            Total parcial: {t.missing_brl_orders} pedidos sem conversão BRL e {t.missing_fee_orders}{' '}
            ocorrências sem multa calculável. Os valores exibidos são apenas a parcela conhecida.
          </output>
        )}
      </section>
      <section className={panel}>
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
        <div className="mt-5 grid gap-5 sm:grid-cols-3">
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
      <section className={panel}>
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
      <section className={panel}>
        <h2 className="text-lg font-semibold text-white">Devoluções por mês da compra</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-white/50">
          Compras do intervalo selecionado agrupadas por mês, com devoluções observadas até hoje. Os
          primeiros 90 dias são uma referência operacional de maturação, não uma garantia de
          encerramento. Meses recentes não são diretamente comparáveis aos antigos.
        </p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-white/50">
                {[
                  'Mês da compra',
                  'Vendas',
                  'Faturamento bruto',
                  'Devoluções',
                  'Valor devolvido',
                  '% do faturamento',
                ].map((h) => (
                  <th key={h} className="px-3 py-3 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.cohorts.map((c) => (
                <tr key={c.month} className="border-b border-white/5">
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
      <section className={panel}>
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
      <section className={panel}>
        <h2 className="text-lg font-semibold text-white">Tempo entre compra e devolução</h2>
        <p className="mt-1 max-w-3xl text-sm leading-6 text-white/60">
          Compra e devolução do mesmo pedido, gateway e conta. A data efetiva só entra no
          cálculo quando foi informada explicitamente pelo gateway.
        </p>
        <RefundDelay delay={data.delay} isPrivate={isPrivate} />
        {data.observed_delay && (
          <details className="mt-6 border-t border-white/10 pt-5" open={!data.delay.sample_count}>
            <summary className="cursor-pointer rounded text-sm font-medium text-cyan-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300">
              Tempo até o recebimento da notificação no TMX
            </summary>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-amber-100">
              Indicador operacional: data da primeira notificação recebida menos data da compra.
              Não é a data efetiva da devolução. Atrasos e reenvios do gateway podem aumentar esse prazo.
              Considera as devoluções contabilizadas no período selecionado, não apenas as notificações
              recebidas nele. Os valores financeiros não foram alterados por esta análise de datas.
            </p>
            <RefundDelay delay={data.observed_delay} isPrivate={isPrivate} basis="observed" />
          </details>
        )}
      </section>
    </>
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
    <div>
      <dt className="text-sm text-white/60">{label}</dt>
      <dd
        className={`mt-2 text-2xl font-semibold tabular-nums ${danger ? 'text-danger' : 'text-white'}`}
      >
        {value}
      </dd>
      <p className="mt-1 text-xs leading-5 text-white/50">{detail}</p>
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
        className={`mt-2 text-2xl font-semibold ${hidden ? 'text-white/60' : value != null && value < 0 ? 'text-emerald-300' : value != null && value > 0 ? 'text-danger' : 'text-white/60'}`}
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
  const h = 240;
  const pad = 30;
  const max = Math.max(1, ...points.flatMap((p) => [p.brl_minor, p.moving_average_brl_minor]));
  const x = (i: number) => pad + ((i + 0.5) * (w - 2 * pad)) / points.length;
  const y = (v: number) => h - pad - (v / max) * (h - 2 * pad);
  const line = points
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.moving_average_brl_minor)}`)
    .join(' ');
  return (
    <figure className="mt-5">
      <div className="overflow-x-auto">
        <svg
          role="img"
          aria-label="Devoluções unificadas e média móvel"
          viewBox={`0 0 ${w} ${h}`}
          className="w-full min-w-[600px]"
        >
          <title>Devoluções unificadas e média móvel</title>
          <line
            x1={pad}
            x2={w - pad}
            y1={h - pad}
            y2={h - pad}
            stroke="currentColor"
            opacity=".2"
          />
          {points.map((p, i) => (
            <rect
              key={p.date}
              x={x(i) - ((w - 2 * pad) / points.length) * 0.32}
              y={y(p.brl_minor)}
              width={Math.max(1, ((w - 2 * pad) / points.length) * 0.64)}
              height={Math.max(0, h - pad - y(p.brl_minor))}
              rx="2"
              fill="#fb7185"
            >
              <title>{`${p.date}: ${refundMoney(p.brl_minor, false)} · ${p.count} devoluções`}</title>
            </rect>
          ))}
          <path d={line} fill="none" stroke="#67e8f9" strokeWidth="2.5" />
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
                fontSize="10"
              >
                {p.date}
              </text>
            ))}
          <text x={pad} y="15" fill="#a5b6be" fontSize="11">
            {refundMoney(max, false)}
          </text>
        </svg>
      </div>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-white/60">
        <span>
          <span className="text-rose-300">━</span> Reembolsos e chargebacks
        </span>
        <span>
          <span className="text-cyan-200">━</span> Média móvel (
          {interval === 'day' ? '7 dias' : interval === 'week' ? '7 semanas' : '7 meses'})
        </span>
      </figcaption>
      <details className="mt-4 text-xs text-white/60">
        <summary className="cursor-pointer py-2">Ver valores do gráfico em tabela</summary>
        <div className="max-h-64 overflow-auto">
          <table className="w-full text-left">
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
                  <td className="py-2">{p.date}</td>
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
    <div className="mt-5 overflow-x-auto">
      <table className="w-full min-w-[820px] text-sm">
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
            ].map((h) => (
              <th key={h} className="px-3 py-3 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className="border-b border-white/5">
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
        <div className="min-w-0 rounded-lg border border-cyan-300/15 bg-cyan-300/[0.03] p-4">
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
                É preciso identificar a data da compra e a da devolução no mesmo pedido.
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
                        className="h-full rounded-full bg-cyan-300/75"
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
              Sem data da compra: {delay.missing_paid_at ?? 0}. Sem data de devolução/recebimento: {delay.missing_reversal_at ?? 0}.
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
