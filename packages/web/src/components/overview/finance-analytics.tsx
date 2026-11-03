'use client';

import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import {
  type FinanceDay,
  financeGrowth,
  financeMonth,
  previousFinanceMonth,
} from '@/lib/finance-analytics';
import { usePrivacy } from '@/lib/privacy-context';
import { useQuery } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, ChartNoAxesCombined, Wallet } from 'lucide-react';
import { useState } from 'react';

const panel = 'rounded-2xl border border-border bg-card/95 p-5 sm:p-6';
const field =
  'min-h-11 rounded-lg border border-input bg-bg-elevated px-3 py-2 text-sm text-foreground';
const labelMonth = (month: string) =>
  new Date(`${month}-15T12:00:00Z`).toLocaleDateString('pt-BR', {
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  });

export function FinanceAnalytics({
  company,
  provider,
  growth,
  coverage,
}: {
  company: string;
  provider: string;
  growth: boolean;
  coverage: string[];
}) {
  const { user } = useAuth();
  const { isPrivate } = usePrivacy();
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const [month, setMonth] = useState(today.slice(0, 7));
  const [chosenCurrency, setCurrency] = useState('');
  const data = useQuery({
    queryKey: ['finance-analytics', user?.id, company, provider, month],
    queryFn: () =>
      request<{ days: FinanceDay[] }>(
        `/v1/companies/${company}/finance/analytics?month=${month}${provider ? `&provider=${provider}` : ''}`,
      ),
    refetchInterval: 60000,
    gcTime: 0,
  });
  return (
    <FinanceAnalyticsView
      days={data.data?.days ?? []}
      month={month}
      today={today}
      chosenCurrency={chosenCurrency}
      setCurrency={setCurrency}
      setMonth={setMonth}
      growth={growth}
      isPrivate={isPrivate}
      loading={data.isPending}
      failed={data.isError}
      coverage={coverage}
    />
  );
}

export function FinanceAnalyticsView({
  days,
  month,
  today,
  chosenCurrency,
  setCurrency,
  setMonth,
  growth,
  isPrivate,
  loading = false,
  failed = false,
  coverage = [],
}: {
  days: FinanceDay[];
  month: string;
  today: string;
  chosenCurrency: string;
  setCurrency: (value: string) => void;
  setMonth: (value: string) => void;
  growth: boolean;
  isPrivate: boolean;
  loading?: boolean;
  failed?: boolean;
  coverage?: string[];
}) {
  const currencies = [
    ...new Set(['USD', 'BRL', ...days.flatMap((d) => (d.currency ? [d.currency] : []))]),
  ];
  const currency =
    chosenCurrency ||
    days.find((d) => d.day.startsWith(month) && d.currency)?.currency ||
    days.find((d) => d.currency)?.currency ||
    'USD';
  const money = (n: number) =>
    isPrivate
      ? '••••'
      : `${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
  const pct = (n: number | null) =>
    isPrivate
      ? '••••'
      : n == null
        ? 'Sem base'
        : `${n > 0 ? '+' : ''}${n.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  const monthDays = new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate();
  const cutoff = month === today.slice(0, 7) ? Number(today.slice(8)) : monthDays;
  const total = financeMonth(days, month, currency, cutoff);
  const previous = financeMonth(days, previousFinanceMonth(month), currency, cutoff);
  const excluded = days
    .filter((d) => d.day.startsWith(month))
    .reduce((sum, d) => sum + d.excluded, 0);
  const months = Array.from({ length: 12 }, (_, i) =>
    new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)) - 12 + i, 1))
      .toISOString()
      .slice(0, 7),
  );
  const daily = Array.from({ length: cutoff }, (_, i) => {
    const day = `${month}-${String(i + 1).padStart(2, '0')}`;
    const rows = days.filter((d) => d.day === day && d.currency === currency);
    return {
      label: String(i + 1).padStart(2, '0'),
      incoming: rows.reduce((s, d) => s + Number(d.incoming), 0),
      outgoing: rows.reduce((s, d) => s + Number(d.outgoing), 0),
    };
  });
  const series = growth
    ? months.map((m) => ({ label: labelMonth(m), ...financeMonth(days, m, currency) }))
    : daily;
  const max = Math.max(1, ...series.flatMap((d) => [d.incoming, d.outgoing]));
  let accumulated = 0;
  const accumulatedPoints = daily.map((d) => {
    accumulated += d.incoming - d.outgoing;
    return { ...d, net: accumulated };
  });
  const low = Math.min(0, ...accumulatedPoints.map((d) => d.net));
  const high = Math.max(1, ...accumulatedPoints.map((d) => d.net));
  const point = (value: number, i: number) =>
    `${20 + (i * 760) / Math.max(1, cutoff - 1)},${150 - ((value - low) / (high - low)) * 120}`;
  const metrics = growth
    ? [
        {
          title: 'Variação das entradas',
          value: pct(financeGrowth(total.incoming, previous.incoming)),
          detail: `Até o dia ${cutoff} nos dois meses`,
          icon: ChartNoAxesCombined,
        },
        {
          title: 'Média diária de entradas',
          value: money(total.incoming / cutoff),
          detail: `${cutoff} dias do mês considerados`,
          icon: ArrowDownLeft,
        },
        {
          title: 'Entradas projetadas',
          value: money((total.incoming / cutoff) * monthDays),
          detail: 'Média diária × dias do mês. Não é saldo.',
          icon: ArrowUpRight,
        },
        {
          title: 'Margem de caixa observada',
          value: pct(total.incoming > 0 ? (total.net / total.incoming) * 100 : null),
          detail: '(Entradas − saídas) ÷ entradas. Não é lucro.',
          icon: Wallet,
        },
      ]
    : [
        {
          title: 'Entradas no mês',
          value: money(total.incoming),
          detail: 'Créditos liquidados importados',
          icon: ArrowDownLeft,
        },
        {
          title: 'Saídas no mês',
          value: money(total.outgoing),
          detail: 'Débitos liquidados importados',
          icon: ArrowUpRight,
        },
        {
          title: 'Acumulado líquido do mês',
          value: money(total.net),
          detail: 'Entradas − saídas. Sem saldo inicial.',
          icon: Wallet,
        },
        {
          title: 'Movimentações consideradas',
          value: isPrivate ? '••••' : String(total.transactions),
          detail: 'Na moeda e no período selecionados',
          icon: ChartNoAxesCombined,
        },
      ];
  return (
    <section
      className="space-y-5"
      aria-label={growth ? 'Crescimento financeiro' : 'Fluxo de caixa mensal'}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">
            {growth ? 'Crescimento do caixa' : 'Entradas, saídas e acumulado'}
          </h2>
          <p className="text-sm text-muted-foreground">
            Histórico bancário salvo no TMX · horário de São Paulo
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <label className="grid gap-1 text-sm">
            Mês
            <input
              type="month"
              className={field}
              value={month}
              min="2000-01"
              max={today.slice(0, 7)}
              onChange={(e) => {
                if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value)) setMonth(e.target.value);
              }}
            />
          </label>
          <label className="grid gap-1 text-sm">
            Moeda
            <select
              className={field}
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {currencies.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
      </div>
      {failed ? (
        <p role="alert" className={panel}>
          Consulta financeira indisponível. Não mostramos zeros no lugar de dados ausentes.
        </p>
      ) : loading ? (
        <output className={`${panel} block`}>Calculando todo o histórico salvo…</output>
      ) : (
        <>
          <div className="rounded-xl border border-border bg-bg-elevated p-4 text-sm text-muted-foreground">
            <p>
              Fluxo observado, ainda não conciliado. Transferências entre contas podem aparecer nos
              dois provedores; não representa faturamento nem lucro. Conversões com duas pontas e
              estados não confirmados ficam fora dos totais ({excluded} registros neste mês).
            </p>
            {coverage.map((line) => (
              <p key={line} className="mt-2">
                {line}
              </p>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {metrics.map((metric) => (
              <div key={metric.title} className={panel}>
                <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
                  {metric.title}
                  <metric.icon size={17} aria-hidden />
                </div>
                <p className="my-3 break-words text-2xl font-semibold tabular-nums">
                  {metric.value}
                </p>
                <p className="text-xs text-muted-foreground">{metric.detail}</p>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-6 rounded-xl border border-border p-4 text-sm">
            <span>
              Custos fixos: <strong>{money(total.fixed)}</strong>
            </span>
            <span>
              Custos variáveis: <strong>{money(total.variable)}</strong>
            </span>
            <span>
              Saques: <strong>{money(total.withdrawals)}</strong>
            </span>
            <span className="text-muted-foreground">
              Saídas ainda não classificadas:{' '}
              {money(total.outgoing - total.fixed - total.variable - total.withdrawals)}
            </span>
          </div>
          {!total.transactions && (
            <p className="text-sm text-muted-foreground">
              Nenhuma movimentação elegível importada neste mês e moeda. Isso não comprova ausência
              de atividade na conta.
            </p>
          )}
          <div className={panel}>
            <div className="mb-6 flex flex-wrap justify-between gap-3">
              <h3 className="font-semibold">{growth ? 'Evolução mensal' : 'Fluxo diário'}</h3>
              <p className="text-sm">
                <span className="text-emerald-600 dark:text-emerald-400">● Entradas</span>{' '}
                <span className="ml-3 text-rose-600 dark:text-rose-400">● Saídas</span>
              </p>
            </div>
            {isPrivate ? (
              <p className="py-16 text-center">Valores financeiros ocultos</p>
            ) : (
              <div className="overflow-x-auto pb-2">
                <div className="flex h-56 min-w-[640px] items-end gap-2">
                  {series.map((d) => (
                    <div
                      key={d.label}
                      className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2 h-full"
                    >
                      <div
                        className="flex h-44 w-full items-end justify-center gap-1"
                        role="img"
                        aria-label={`${d.label}: entradas ${money(d.incoming)}, saídas ${money(d.outgoing)}`}
                        title={`${d.label} · Entradas ${money(d.incoming)} · Saídas ${money(d.outgoing)}`}
                      >
                        <div
                          className="w-2/5 rounded-t bg-emerald-500 motion-safe:transition-transform motion-safe:duration-500 origin-bottom group-hover:brightness-110"
                          style={{ height: '100%', transform: `scaleY(${d.incoming / max})` }}
                        />
                        <div
                          className="w-2/5 rounded-t bg-rose-500 motion-safe:transition-transform motion-safe:duration-500 origin-bottom group-hover:brightness-110"
                          style={{ height: '100%', transform: `scaleY(${d.outgoing / max})` }}
                        />
                      </div>
                      <span className="text-[10px] text-muted-foreground">{d.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          {!growth && (
            <div className={panel}>
              <h3 className="font-semibold">Acumulado líquido ao longo do mês</h3>
              <p className="text-sm text-muted-foreground">
                Resultado de caixa desde o dia 1, sem somar o saldo anterior.
              </p>
              {isPrivate ? (
                <p className="py-12 text-center">Valores financeiros ocultos</p>
              ) : (
                <svg
                  viewBox="0 0 800 180"
                  className="mt-4 w-full"
                  role="img"
                  aria-label={`Acumulado líquido: ${money(total.net)}`}
                >
                  <line
                    x1="20"
                    x2="780"
                    y1={150 - ((0 - low) / (high - low)) * 120}
                    y2={150 - ((0 - low) / (high - low)) * 120}
                    stroke="currentColor"
                    opacity="0.2"
                  />
                  <polyline
                    points={accumulatedPoints.map((d, i) => point(d.net, i)).join(' ')}
                    fill="none"
                    stroke="var(--primary, #22d3ee)"
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                  />
                  {accumulatedPoints.map((d, i) => {
                    const [cx, cy] = point(d.net, i).split(',');
                    return (
                      <circle
                        key={d.label}
                        cx={cx}
                        cy={cy}
                        r="4"
                        fill="currentColor"
                        tabIndex={0}
                        aria-label={`Dia ${d.label}: ${money(d.net)}`}
                      >
                        <title>{`Dia ${d.label}: ${money(d.net)}`}</title>
                      </circle>
                    );
                  })}
                </svg>
              )}
            </div>
          )}
          <details className={panel} open={growth}>
            <summary className="cursor-pointer font-semibold">
              Conferir valores {growth ? 'por mês' : 'por dia'}
            </summary>
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {[growth ? 'Mês' : 'Dia', 'Entradas', 'Saídas', 'Resultado de caixa'].map(
                      (h) => (
                        <th key={h} scope="col" className="p-3">
                          {h}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {series.map((d) => (
                    <tr key={d.label} className="border-t border-border">
                      <th scope="row" className="p-3 font-normal">
                        {d.label}
                      </th>
                      <td className="p-3 tabular-nums">{money(d.incoming)}</td>
                      <td className="p-3 tabular-nums">{money(d.outgoing)}</td>
                      <td className="p-3 tabular-nums">{money(d.incoming - d.outgoing)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
