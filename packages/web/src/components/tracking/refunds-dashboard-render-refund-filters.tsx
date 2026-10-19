'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { selectedMonthRange } from '@/lib/date-range';
import { Field, ago, panel, select, today } from './refunds-dashboard-support';
import type { useRefundsDashboardState } from './refunds-dashboard-use-refunds-dashboard-state';
import './refunds-dashboard.css';

export function renderRefundFilters({
  from,
  to,
  offerId,
  setOfferId,
  product,
  setProduct,
  provider,
  setProvider,
  vendepay,
  setVendepay,
  setPage,
  offers,
  report,
  data,
  range,
}: Pick<
  ReturnType<typeof useRefundsDashboardState>,
  | 'from'
  | 'to'
  | 'offerId'
  | 'setOfferId'
  | 'product'
  | 'setProduct'
  | 'provider'
  | 'setProvider'
  | 'vendepay'
  | 'setVendepay'
  | 'setPage'
  | 'offers'
  | 'report'
  | 'data'
  | 'range'
>) {
  return (
    <section className={`${panel} refund-filters`} aria-label="Filtros do relatório">
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-white">Período e filtros</h2>
          <p className="mt-1 text-xs text-slate-400">Reembolsos e chargebacks sempre unificados.</p>
        </div>
        <span className="refund-scope">
          {offerId
            ? offers.data?.find((o) => o.id === offerId)?.name || 'Oferta selecionada'
            : 'Minhas ofertas · empresa TMX'}
        </span>
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        {[
          ['Hoje', today(), today()],
          ['Ontem', ago(1), ago(1)],
          ['Últimos 7 dias', ago(6), today()],
          ['Este mês', `${today().slice(0, 7)}-01`, today()],
        ].map(([label, a, b]) => (
          <Button
            key={label}
            size="sm"
            aria-pressed={a === from && b === to}
            variant={a === from && b === to ? 'default' : 'outline'}
            onClick={() => range(a!, b!)}
          >
            {label}
          </Button>
        ))}
        <Button
          size="sm"
          variant="outline"
          className="sm:ml-auto"
          disabled={report.isFetching}
          onClick={() => void report.refetch()}
        >
          {report.isFetching ? 'Atualizando…' : 'Atualizar dados'}
        </Button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <Field label="Selecionar mês">
          <Input
            aria-label="Selecionar mês"
            type="month"
            max={today().slice(0, 7)}
            value={
              from.endsWith('-01') && selectedMonthRange(from.slice(0, 7))?.to === to
                ? from.slice(0, 7)
                : ''
            }
            onChange={(e) => {
              const r = selectedMonthRange(e.target.value);
              if (r) range(r.from, r.to);
            }}
          />
        </Field>
        <Field label="De">
          <Input
            aria-label="De"
            type="date"
            value={from}
            max={to}
            onChange={(e) => range(e.target.value, to)}
          />
        </Field>
        <Field label="Até">
          <Input
            aria-label="Até"
            type="date"
            value={to}
            min={from}
            max={today()}
            onChange={(e) => range(from, e.target.value)}
          />
        </Field>
      </div>
      <div className="mt-5 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Oferta">
          <select
            aria-label="Oferta"
            className={select}
            value={offerId}
            onChange={(e) => {
              setOfferId(e.target.value);
              setProduct('');
              setPage(1);
            }}
          >
            <option value="">Minhas ofertas da empresa TMX</option>
            {offers.data?.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Gateway">
          <select
            aria-label="Gateway"
            className={select}
            value={provider}
            onChange={(e) => {
              setProvider(e.target.value);
              setVendepay('');
              setProduct('');
              setPage(1);
            }}
          >
            <option value="">Todos os gateways</option>
            {[
              ...new Set([
                'vendepay',
                'syzepay',
                'paysight',
                'explodely',
                ...(data?.providers ?? []),
              ]),
            ].map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Conta VendePay">
          <select
            aria-label="Conta VendePay"
            className={select}
            value={vendepay}
            disabled={Boolean(provider && provider !== 'vendepay')}
            onChange={(e) => {
              setVendepay(e.target.value as typeof vendepay);
              setProduct('');
              setPage(1);
            }}
          >
            <option value="">Todas as contas</option>
            <option value="mainex">VendePay Mainex</option>
            <option value="cobrak">VendePay Cobrak</option>
          </select>
        </Field>
        <Field label="Produto">
          <select
            aria-label="Produto"
            className={select}
            value={product}
            onChange={(e) => {
              setProduct(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos os produtos</option>
            {data?.products.map((p) => (
              <option key={p.product_name} value={p.product_name}>
                {p.product_name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {!offerId && (
        <p className="mt-3 text-sm text-white/60">
          Receita, devoluções e multas somente das ofertas criadas pelo seu perfil e vinculadas à
          empresa TMX. Outras empresas e outros membros não entram neste consolidado.
        </p>
      )}
      {offers.isError && (
        <p role="alert" className="mt-3 text-sm text-amber-200">
          Não foi possível carregar as ofertas.{' '}
          <button type="button" className="underline" onClick={() => void offers.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
    </section>
  );
}
