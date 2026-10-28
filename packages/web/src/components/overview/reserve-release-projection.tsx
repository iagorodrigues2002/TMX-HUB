'use client';

import { formatCurrency } from '@/components/dashboard/kpi-cards';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import { usePrivacy } from '@/lib/privacy-context';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock } from 'lucide-react';

export interface ReserveProjectionDay {
  date: string;
  sales: number;
  reserve_brl_minor: number;
  reversed_reserve_brl_minor: number;
  missing_values: number;
}
export interface ReserveProjectionData {
  as_of: string;
  today: ReserveProjectionDay;
  days: ReserveProjectionDay[];
  next_7_brl_minor: number;
  next_30_brl_minor: number;
  pending_after_today_brl_minor: number;
  missing_dates: number;
  first_recorded_purchase: string | null;
  offer_count: number;
}
const dateLabel = (date: string) => date.split('-').reverse().join('/');

export function ReserveProjectionView({
  data,
  isPrivate = false,
}: { data: ReserveProjectionData; isPrivate?: boolean }) {
  const money = (value: number) => (isPrivate ? '••••' : formatCurrency(value / 100, 'BRL'));
  const count = (value: number) => (isPrivate ? '••••' : value.toLocaleString('pt-BR'));
  const warnings = data.days.reduce((n, day) => n + day.missing_values, 0);
  const cards = [
    ['Maturação prevista hoje', data.today.reserve_brl_minor],
    ['Próximos 7 dias', data.next_7_brl_minor],
    ['Próximos 30 dias', data.next_30_brl_minor],
    ['Ainda a maturar após hoje', data.pending_after_today_brl_minor],
  ] as const;
  return (
    <>
      <p className="mt-1 text-xs text-muted-foreground">
        Posição em {dateLabel(data.as_of)} · BRL · VendePay · {data.offer_count} oferta(s). Não
        depende do filtro de período acima.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map(([label, value]) => (
          <div key={label} className="rounded-xl border border-border bg-background/60 p-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-xl font-semibold tabular-nums text-foreground">
              {warnings || data.missing_dates ? '≥ ' : ''}
              {money(value)}
            </p>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Hoje: {count(data.today.sales)} compra(s) na data de vencimento.{' '}
        {money(data.today.reversed_reserve_brl_minor)} da reserva prevista está ligada a compras com
        reembolso ou chargeback e pode sofrer compensações. Não foi descontado novamente do
        faturamento.
      </p>
      {(warnings > 0 || data.missing_dates > 0) && (
        <output className="mt-2 block text-xs text-amber-500">
          Projeção parcial: {count(warnings)} compra(s) sem valor ou percentual válido e{' '}
          {count(data.missing_dates)} sem data de aprovação. Esses valores não foram tratados como
          zero.
        </output>
      )}
      <details className="mt-4 rounded-lg border border-border">
        <summary className="cursor-pointer p-3 text-sm font-medium">
          Ver calendário diário de liberação · hoje e próximos 90 dias
        </summary>
        <div className="max-h-80 overflow-auto">
          <table className="w-full min-w-[580px] text-left text-sm">
            <thead className="sticky top-0 bg-card text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="p-3">
                  Liberação prevista
                </th>
                <th scope="col" className="p-3">
                  Compras
                </th>
                <th scope="col" className="p-3">
                  Reserva original
                </th>
                <th scope="col" className="p-3">
                  Ligada a devoluções
                </th>
              </tr>
            </thead>
            <tbody>
              {data.days.map((day) => (
                <tr key={day.date} className="border-t border-border">
                  <th scope="row" className="p-3 font-normal">
                    {dateLabel(day.date)}
                    {day.date === data.as_of ? ' · Hoje' : ''}
                  </th>
                  <td className="p-3 tabular-nums">{count(day.sales)}</td>
                  <td className="p-3 tabular-nums">
                    {day.missing_values ? '≥ ' : ''}
                    {money(day.reserve_brl_minor)}
                  </td>
                  <td className="p-3 tabular-nums">{money(day.reversed_reserve_brl_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
        Data de aprovação + prazo de reserva configurado (atualmente 90 dias). Fronts e upsells
        entram uma vez por pedido. Percentuais atuais e conversões disponíveis no TMX; não há
        histórico das mudanças de taxas. Próximos 7/30 dias começam amanhã. Esta é a reserva
        original prevista para maturar, não uma confirmação de crédito ou saldo para saque; pode
        haver compensações do gateway. Não prevê novas vendas nem devoluções futuras.
      </p>
      {!data.today.sales && (
        <p className="mt-2 text-xs text-muted-foreground">
          Não há compras registradas com vencimento hoje neste escopo. Ausência de registros não
          comprova que o histórico esteja completo.
        </p>
      )}
    </>
  );
}

export function ReserveReleaseProjection({ offerIds }: { offerIds: string[] }) {
  const { user } = useAuth();
  const { isPrivate } = usePrivacy();
  const ids = [...new Set(offerIds)].sort();
  const query = useQuery({
    queryKey: ['reserve-projection', user?.id, user?.role, ids],
    queryFn: () =>
      request<ReserveProjectionData>(
        `/v1/tracking/reserve-projection?${new URLSearchParams({ offer_ids: ids.join(',') })}`,
      ),
    enabled: !!user && ids.length > 0,
    staleTime: 60000,
    refetchInterval: 60000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: false,
    retry: false,
  });
  if (!ids.length) return null;
  return (
    <section
      className="rounded-xl border border-border bg-card/95 p-5"
      aria-label="Projeção de liberação da reserva"
    >
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <CalendarClock aria-hidden className="h-4 w-4 text-cyan-400" />
        Projeção de liberação da reserva
      </h3>
      {query.data ? (
        <ReserveProjectionView data={query.data} isPrivate={isPrivate} />
      ) : query.isError ? (
        <output className="mt-3 block text-sm text-muted-foreground">
          Consulta de projeção indisponível. Não usamos o faturamento do período como substituição.
        </output>
      ) : (
        <output className="mt-3 block text-sm text-muted-foreground">
          Calculando os vencimentos da reserva…
        </output>
      )}
    </section>
  );
}
