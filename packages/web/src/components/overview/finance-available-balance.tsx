'use client';

import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import {
  type AvailableAccount,
  type FinanceRate,
  availableFinanceBalance,
} from '@/lib/finance-analytics';
import { usePrivacy } from '@/lib/privacy-context';
import { useQuery } from '@tanstack/react-query';

export function FinanceAvailableBalance({
  company,
  accounts,
}: { company: string; accounts: AvailableAccount[] }) {
  const { user } = useAuth();
  const { isPrivate } = usePrivacy();
  const query = useQuery({
    queryKey: ['finance-exchange', user?.id, company],
    queryFn: () =>
      request<{ rates: FinanceRate[]; source: string }>(
        `/v1/companies/${company}/finance/exchange`,
      ),
    staleTime: 300000,
    gcTime: 0,
  });
  const result = availableFinanceBalance(accounts, query.data?.rates ?? []);
  const usd = query.data?.rates.find((r) => r.currency === 'USD');
  const quoteDay = (date: Date) =>
    date.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
  const oldQuote = usd && quoteDay(new Date(usd.fetched_at)) !== quoteDay(new Date());
  const money = (n: number | null, currency: string) =>
    isPrivate
      ? '••••'
      : n == null
        ? 'Indisponível'
        : n.toLocaleString('pt-BR', { style: 'currency', currency });
  const ready = !query.isPending && !query.isError && result.count > 0 && result.unavailable === 0;
  return (
    <section
      className="rounded-2xl border border-primary/30 bg-card/95 p-5 sm:p-6"
      aria-label="Saldo disponível consolidado"
    >
      <div className="flex flex-wrap justify-between gap-3">
        <h2 className="font-semibold">Disponível nas contas</h2>
        <p className="text-sm text-muted-foreground">Wise + LootRush · empresa selecionada</p>
      </div>
      <div className="my-5 grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-sm text-muted-foreground">Equivalente em dólar</p>
          <p className="text-3xl font-semibold tabular-nums">
            {money(ready ? result.usd : null, 'USD')}
          </p>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">Equivalente em reais</p>
          <p className="text-3xl font-semibold tabular-nums">
            {money(ready && usd ? result.brl : null, 'BRL')}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Somente saldos disponíveis. Não soma patrimônio total da LootRush nem reserva Wise.
        Conversão indicativa, sem tarifas ou garantia de valor de saque.
      </p>
      {query.isPending ? (
        <output className="mt-2 block text-sm">Consultando cotação…</output>
      ) : !ready || !usd ? (
        <output className="mt-2 block text-sm text-amber-600 dark:text-amber-400">
          Consolidado indisponível: falta saldo ou cotação para alguma moeda. Os valores individuais
          permanecem abaixo.
        </output>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          US$ 1 = {isPrivate ? '••••' : money(Number(usd.rate), 'BRL')} · cotação consultada em{' '}
          {new Date(usd.fetched_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.{' '}
          {query.data?.source}. Última cotação disponível, inclusive em dias sem atualização.
        </p>
      )}
      {result.stale && (
        <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
          Há saldos desatualizados. Confira o horário da última consulta em cada conta.
        </p>
      )}
      {oldQuote && (
        <p className="mt-2 text-sm text-amber-600 dark:text-amber-400">
          A cotação disponível não foi atualizada hoje. A conversão usa a última consulta indicada
          acima.
        </p>
      )}
    </section>
  );
}
