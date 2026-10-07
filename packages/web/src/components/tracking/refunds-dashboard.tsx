'use client';

import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { formatMoney, useDisplayCurrency } from '@/lib/currency-preference';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowDownRight,
  BadgeDollarSign,
  CreditCard,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
} from 'lucide-react';
import { useMemo, useState } from 'react';

const TZ = 'America/Sao_Paulo';
const AUDIT_PAGE_SIZE = 50;
function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}
function ago(days: number) {
  const [y, m, d] = today().split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! - days!, 12)).toISOString().slice(0, 10);
}
function money(minor: number | string | undefined) {
  return formatMoney(String(minor ?? 0), 'BRL');
}
function dateTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: TZ,
  }).format(new Date(value));
}

export function TrackingRefundsSummary({ offerId }: { offerId: string }) {
  const [displayCurrency] = useDisplayCurrency();
  const from = ago(29);
  const to = today();
  const report = useQuery({
    queryKey: ['refunds-dashboard', 'tracking-summary', from, to, offerId],
    queryFn: () => apiClient.getRefundsDashboard(from, to, offerId),
    retry: false,
  });
  const value = (minor: number | string | undefined) =>
    displayCurrency === 'USD'
      ? formatMoney(String(Math.round(Number(minor ?? 0) / 500)), 'USD')
      : money(minor);

  if (report.isLoading) {
    return <DataState variant="loading" title="Carregando resumo de reembolsos…" />;
  }
  if (report.isError || !report.data) {
    return (
      <DataState
        variant="error"
        title="Não foi possível carregar o resumo financeiro"
        description="O relatório completo continua disponível na área de Reembolsos."
        onRetry={() => void report.refetch()}
        isRetrying={report.isFetching}
        action={
          <Button asChild variant="outline">
            <a href="/reembolsos">Abrir relatório completo</a>
          </Button>
        }
      />
    );
  }

  return (
    <section className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-white">Reembolsos e chargebacks</h2>
          <p className="mt-1 text-sm text-white/50">
            Últimos 30 dias da oferta ativa. Filtros e auditoria detalhada ficam no relatório.
          </p>
        </div>
        <Button asChild variant="outline">
          <a href="/reembolsos">Abrir relatório completo</a>
        </Button>
      </div>
      <dl className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-amber-300/15 bg-amber-300/[0.04] p-4">
          <dt className="text-xs text-amber-100/70">Reembolsos</dt>
          <dd className="mono-num mt-2 text-xl text-white">
            {value(report.data.totals.refunded_brl_minor)}
          </dd>
          <p className="mt-1 text-xs text-white/40">{report.data.totals.refunded_orders} pedidos</p>
        </div>
        <div className="rounded-lg border border-danger/20 bg-danger/[0.04] p-4">
          <dt className="text-xs text-danger">Chargebacks</dt>
          <dd className="mono-num mt-2 text-xl text-white">
            {value(report.data.totals.chargeback_brl_minor)}
          </dd>
          <p className="mt-1 text-xs text-white/40">
            {report.data.totals.chargeback_orders} ocorrências
          </p>
        </div>
        <div className="rounded-lg border border-white/[0.08] bg-black/10 p-4">
          <dt className="text-xs text-white/50">Impacto total</dt>
          <dd className="mono-num mt-2 text-xl text-white">
            {value(report.data.totals.brl_minor)}
          </dd>
          <p className="mt-1 text-xs text-white/40">{report.data.totals.count} reversões</p>
        </div>
      </dl>
    </section>
  );
}

export function RefundsDashboard({ initialOfferId = '' }: { initialOfferId?: string }) {
  const [from, setFrom] = useState(() => ago(29));
  const [to, setTo] = useState(today);
  const [offerId, setOfferId] = useState(initialOfferId);
  const [product, setProduct] = useState('');
  const [vendepay, setVendepay] = useState<'' | 'mainex' | 'cobrak'>('');
  const [hoveredDay, setHoveredDay] = useState<string | null>(null);
  const [auditPage, setAuditPage] = useState(1);
  const [displayCurrency] = useDisplayCurrency();
  const offers = useQuery({ queryKey: ['offers'], queryFn: apiClient.listOffers, retry: false });
  const report = useQuery({
    queryKey: ['refunds-dashboard', from, to, offerId, product, vendepay],
    queryFn: () =>
      apiClient.getRefundsDashboard(
        from,
        to,
        offerId || undefined,
        product || undefined,
        vendepay || undefined,
      ),
    retry: false,
  });
  const data = report.data;
  const maxDaily = Math.max(...(data?.daily.map((day) => day.brl_minor) ?? [1]), 1);
  const products = useMemo(() => data?.products ?? [], [data]);
  const vendepays = useMemo(() => data?.vendepays ?? [], [data]);
  const leadingVendepay = vendepays.find((item) => item.count > 0);
  const unclassifiedVendepays = vendepays.filter(
    (item) =>
      item.connection_name !== 'VendePay Mainex' &&
      item.connection_name !== 'VendePay Cobrak' &&
      item.count > 0,
  );
  const auditItems = data?.items ?? [];
  const auditPageCount = Math.max(1, Math.ceil(auditItems.length / AUDIT_PAGE_SIZE));
  const currentAuditPage = Math.min(auditPage, auditPageCount);
  const auditStart = (currentAuditPage - 1) * AUDIT_PAGE_SIZE;
  const paginatedAuditItems = auditItems.slice(auditStart, auditStart + AUDIT_PAGE_SIZE);
  const pick = (value: number | string | undefined) =>
    displayCurrency === 'USD'
      ? formatMoney(String(Math.round(Number(value ?? 0) / 500)), 'USD')
      : money(value);

  return (
    <div className="space-y-6">
      <section className="tmx-command-hero rounded-2xl border border-cyan-300/15 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="flex gap-4">
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-danger/25 bg-danger/[.08]">
              <RotateCcw className="h-5 w-5 text-danger" />
            </div>
            <div>
              <p className="hud-label">Inteligência financeira</p>
              <h1 className="mt-1 text-2xl font-semibold text-white sm:text-3xl">
                Reembolsos e chargebacks
              </h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
                Acompanhe perdas reais por oferta, produto e data usando o instante em que o
                reembolso ou chargeback ocorreu.
              </p>
            </div>
          </div>
          <span className="rounded-full border border-white/10 bg-black/15 px-3 py-1.5 font-mono text-[10px] uppercase tracking-[.16em] text-white/55">
            Horário de São Paulo
          </span>
        </div>
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <label htmlFor="refunds-from" className="space-y-1">
            <span className="hud-label">De</span>
            <Input
              id="refunds-from"
              type="date"
              value={from}
              max={to}
              onChange={(e) => {
                setFrom(e.target.value);
                setAuditPage(1);
              }}
            />
          </label>
          <label htmlFor="refunds-to" className="space-y-1">
            <span className="hud-label">Até</span>
            <Input
              id="refunds-to"
              type="date"
              value={to}
              min={from}
              max={today()}
              onChange={(e) => {
                setTo(e.target.value);
                setAuditPage(1);
              }}
            />
          </label>
          <label htmlFor="refunds-offer" className="space-y-1">
            <span className="hud-label">Oferta</span>
            <select
              id="refunds-offer"
              aria-invalid={offers.isError}
              aria-describedby={offers.isError ? 'refund-offers-error' : undefined}
              value={offerId}
              onChange={(e) => {
                setOfferId(e.target.value);
                setAuditPage(1);
              }}
              className="h-10 w-full rounded-lg border border-cyan-100/[.16] bg-bg-elevated px-3 text-sm text-white"
            >
              <option value="">Todas as ofertas</option>
              {offers.data?.map((offer) => (
                <option key={offer.id} value={offer.id}>
                  {offer.name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="refunds-product" className="space-y-1">
            <span className="hud-label">Produto</span>
            <select
              id="refunds-product"
              value={product}
              onChange={(e) => {
                setProduct(e.target.value);
                setAuditPage(1);
              }}
              className="h-10 w-full rounded-lg border border-cyan-100/[.16] bg-bg-elevated px-3 text-sm text-white"
            >
              <option value="">Todos os produtos</option>
              {products.map((item) => (
                <option key={item.product_name} value={item.product_name}>
                  {item.product_name}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="refunds-vendepay" className="space-y-1">
            <span className="hud-label">VendePay</span>
            <select
              id="refunds-vendepay"
              value={vendepay}
              onChange={(e) => {
                setVendepay(e.target.value as '' | 'mainex' | 'cobrak');
                setAuditPage(1);
              }}
              className="h-10 w-full rounded-lg border border-cyan-100/[.16] bg-bg-elevated px-3 text-sm text-white"
            >
              <option value="">Todas as VendePay</option>
              <option value="mainex">VendePay Mainex</option>
              <option value="cobrak">VendePay Cobrak</option>
            </select>
          </label>
        </div>
        {offers.isError && (
          <p id="refund-offers-error" role="alert" className="mt-3 text-sm text-danger">
            Não foi possível carregar a lista de ofertas. O relatório continua disponível sem esse
            filtro.{' '}
            <button
              type="button"
              className="font-semibold underline underline-offset-4"
              onClick={() => void offers.refetch()}
            >
              Tentar novamente
            </button>
          </p>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFrom(today());
              setTo(today());
              setAuditPage(1);
            }}
          >
            Hoje
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFrom(ago(6));
              setTo(today());
              setAuditPage(1);
            }}
          >
            7 dias
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setFrom(ago(29));
              setTo(today());
              setAuditPage(1);
            }}
          >
            30 dias
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={report.isFetching}
            onClick={() => void report.refetch()}
          >
            <RefreshCw className={`h-3.5 w-3.5 ${report.isFetching ? 'animate-spin' : ''}`} />
            {report.isFetching ? 'Atualizando' : 'Atualizar'}
          </Button>
        </div>
      </section>

      {report.isLoading ? (
        <DataState variant="loading" title="Carregando dados financeiros…" />
      ) : !data ? (
        <DataState
          variant="error"
          title="Não foi possível carregar reembolsos"
          description="Os valores financeiros não foram exibidos para evitar apresentar totais incorretos."
          isRetrying={report.isFetching}
          onRetry={() => void report.refetch()}
        />
      ) : (
        <>
          {report.isError && (
            <output
              aria-live="polite"
              className="block rounded-xl border border-warning/25 bg-warning/[0.07] px-4 py-3 text-sm text-warning"
            >
              Não foi possível atualizar agora. Exibindo os últimos dados carregados.
            </output>
          )}
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              icon={RotateCcw}
              label="Reembolsos"
              value={pick(data?.totals.refunded_brl_minor)}
              detail={`${data?.totals.refunded_orders ?? 0} pedidos`}
              tone="amber"
            />
            <Kpi
              icon={ShieldAlert}
              label="Chargebacks"
              value={pick(data?.totals.chargeback_brl_minor)}
              detail={`${data?.totals.chargeback_orders ?? 0} ocorrências`}
              tone="danger"
            />
            <Kpi
              icon={ArrowDownRight}
              label="Impacto total"
              value={pick(data?.totals.brl_minor)}
              detail={`${data?.totals.count ?? 0} reversões`}
              tone="danger"
            />
            <Kpi
              icon={BadgeDollarSign}
              label="Taxas de R/CB"
              value={money(data?.totals.fee_brl_minor)}
              detail={
                data?.totals.fee_exchange_rate
                  ? `US$ 27 por ocorrência · USD/BRL ${Number(data.totals.fee_exchange_rate).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
                  : 'US$ 27 por ocorrência · cotação indisponível'
              }
              tone="amber"
            />
          </section>

          <section className="rounded-2xl border border-cyan-200/[.12] bg-bg-elevated/70 p-5">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="hud-label">Origem da reversão</p>
                <h2 className="mt-1 text-lg font-semibold text-white">
                  VendePay Mainex × VendePay Cobrak
                </h2>
              </div>
              {leadingVendepay ? (
                <p className="rounded-full border border-danger/20 bg-danger/[.08] px-3 py-1.5 text-xs text-danger">
                  Maior impacto:{' '}
                  <span className="font-semibold">{leadingVendepay.connection_name}</span> ·{' '}
                  {pick(leadingVendepay.brl_minor)}
                </p>
              ) : null}
            </div>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {vendepays
                .filter(
                  (item) =>
                    item.connection_name === 'VendePay Mainex' ||
                    item.connection_name === 'VendePay Cobrak',
                )
                .map((item) => (
                  <div
                    key={item.connection_name}
                    className="border-t border-white/[.16] bg-white/[.025] px-4 pb-4 pt-3"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-medium text-white">{item.connection_name}</p>
                      <span
                        className={
                          item.brl_minor === (leadingVendepay?.brl_minor ?? -1) && item.count > 0
                            ? 'text-xs font-medium text-danger'
                            : 'text-xs text-white/40'
                        }
                      >
                        {item.brl_minor === (leadingVendepay?.brl_minor ?? -1) && item.count > 0
                          ? 'Maior impacto'
                          : '—'}
                      </span>
                    </div>
                    <p className="mono-num mt-3 text-2xl text-danger">{pick(item.brl_minor)}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-white/50">
                      <span>{item.refunded_orders} reembolsos</span>
                      <span>{item.chargeback_orders} chargebacks</span>
                      <span>{item.count} ocorrências</span>
                    </div>
                    <div className="mt-3 border-t border-white/[.1] pt-2 text-xs text-amber-100/85">
                      Taxas de R/CB:{' '}
                      <span className="mono-num font-medium">{money(item.fee_brl_minor)}</span>{' '}
                      <span className="text-white/35">· US$ 27 × {item.count}</span>
                    </div>
                  </div>
                ))}
            </div>
            {unclassifiedVendepays.length ? (
              <p className="mt-3 text-xs text-amber-100/65">
                {unclassifiedVendepays
                  .map((item) => `${item.connection_name}: ${pick(item.brl_minor)}`)
                  .join(' · ')}{' '}
                permanece separado por não ter classificação Mainex/Cobrak na conexão.
              </p>
            ) : null}
          </section>

          <section className="space-y-5">
            <div className="min-w-0 rounded-2xl border border-white/[.09] bg-bg-elevated/70 p-5">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="hud-label">Evolução</p>
                  <h2 className="mt-1 text-lg font-semibold text-white">Valor revertido por dia</h2>
                </div>
                <CreditCard className="h-5 w-5 text-cyan-200/70" />
              </div>
              {!data?.daily.length ? (
                <Empty />
              ) : (
                <div className="mt-7 overflow-x-auto pb-2">
                  <div className="relative flex h-60 min-w-[780px] items-end gap-1.5 border-t border-white/[.16] pt-3 before:absolute before:inset-x-0 before:bottom-9 before:border-t before:border-dashed before:border-white/[.06]">
                    {data.daily.map((day) => {
                      const isHovered = hoveredDay === day.date;
                      return (
                        <div
                          key={day.date}
                          onMouseEnter={() => setHoveredDay(day.date)}
                          onMouseLeave={() => setHoveredDay(null)}
                          className={`relative flex h-full min-w-5 flex-1 flex-col justify-end ${isHovered ? 'z-40' : 'z-10'}`}
                        >
                          <div
                            className={`pointer-events-none absolute left-1/2 top-3 z-30 w-max max-w-56 -translate-x-1/2 rounded-lg border border-cyan-100/20 bg-[#06131b]/[.98] px-3 py-2 text-left shadow-2xl transition-all ${isHovered ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0'}`}
                          >
                            <p className="font-mono text-[10px] text-cyan-100/70">
                              {day.date.split('-').reverse().join('/')}
                            </p>
                            <p className="mt-1 text-xs text-amber-100">
                              Reembolsos:{' '}
                              <span className="mono-num font-medium">
                                {money(day.refunded_brl_minor)}
                              </span>
                            </p>
                            <p className="mt-0.5 text-xs text-danger">
                              Chargebacks:{' '}
                              <span className="mono-num font-medium">
                                {money(day.chargeback_brl_minor)}
                              </span>
                            </p>
                            <p className="mt-1 border-t border-white/10 pt-1 text-xs text-white/80">
                              Total:{' '}
                              <span className="mono-num font-medium">{money(day.brl_minor)}</span>
                            </p>
                          </div>
                          <button
                            type="button"
                            aria-label={`${day.date}: reembolsos ${money(day.refunded_brl_minor)}, chargebacks ${money(day.chargeback_brl_minor)}`}
                            onFocus={() => setHoveredDay(day.date)}
                            onBlur={() => setHoveredDay(null)}
                            className="min-h-1 w-full cursor-help rounded-t border-x-0 border-b-0 border-t border-amber-100/35 bg-gradient-to-t from-danger/70 to-amber-300/80 p-0 transition hover:brightness-125"
                            style={{ height: `${Math.max(3, (day.brl_minor / maxDaily) * 100)}%` }}
                          />
                          <span className="mt-2 -rotate-45 origin-top-left whitespace-nowrap font-mono text-[10px] font-medium text-white/55">
                            {day.date.slice(5)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            <div className="min-w-0 overflow-hidden rounded-2xl border border-white/[.09] bg-bg-elevated/70 p-5">
              <p className="hud-label">Produtos mais afetados</p>
              <h2 className="mt-1 text-lg font-semibold text-white">Onde está a perda</h2>
              <div className="mt-5 grid gap-x-6 gap-y-4 md:grid-cols-2 xl:grid-cols-3">
                {products.length ? (
                  products.slice(0, 6).map((item) => (
                    <div key={item.product_name} className="min-w-0">
                      <div className="flex min-w-0 justify-between gap-3 text-sm">
                        <span className="min-w-0 truncate text-white/70">{item.product_name}</span>
                        <span className="mono-num shrink-0 text-danger">
                          {pick(item.brl_minor)}
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[.06]">
                        <div
                          className="h-full rounded-full bg-danger/75"
                          style={{
                            width: `${Math.max(4, (item.brl_minor / Math.max(products[0]?.brl_minor ?? 1, 1)) * 100)}%`,
                          }}
                        />
                      </div>
                      <p className="mt-1 text-[10px] text-white/35">
                        {item.refunded_orders} reembolsos · {item.chargeback_orders} chargebacks
                      </p>
                    </div>
                  ))
                ) : (
                  <Empty />
                )}
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-white/[.09] bg-bg-elevated/70 p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-200" />
              <div>
                <p className="hud-label">Por oferta</p>
                <h2 className="mt-1 text-lg font-semibold text-white">Exposição por funil</h2>
              </div>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[700px] text-sm">
                <thead className="border-b border-white/[.08] text-left text-[10px] uppercase tracking-wider text-white/40">
                  <tr>
                    <th className="pb-3 font-medium">Oferta</th>
                    <th className="pb-3 text-right font-medium tabular-nums">Reembolsos</th>
                    <th className="pb-3 text-right font-medium tabular-nums">Chargebacks</th>
                    <th className="pb-3 text-right font-medium tabular-nums">Impacto total</th>
                    <th className="pb-3 text-right font-medium tabular-nums">Ocorrências</th>
                  </tr>
                </thead>
                <tbody>
                  {data?.offers.map((offer) => (
                    <tr key={offer.offer_id} className="border-b border-white/[.05] last:border-0">
                      <td className="py-3 font-medium text-white">{offer.offer_name}</td>
                      <td className="mono-num py-3 text-right tabular-nums text-amber-200">
                        {pick(offer.refunded_brl_minor)}
                      </td>
                      <td className="mono-num py-3 text-right tabular-nums text-danger">
                        {pick(offer.chargeback_brl_minor)}
                      </td>
                      <td className="mono-num py-3 text-right font-medium tabular-nums text-white">
                        {pick(offer.brl_minor)}
                      </td>
                      <td className="py-3 text-right tabular-nums text-white/55">{offer.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-2xl border border-white/[.09] bg-bg-elevated/70 p-5">
            <p className="hud-label">Auditoria</p>
            <h2 className="mt-1 text-lg font-semibold text-white">Pedidos revertidos</h2>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead className="border-b border-white/[.08] text-left text-[10px] uppercase tracking-wider text-white/40">
                  <tr>
                    <th className="pb-3">Quando</th>
                    <th className="pb-3">Oferta / produto</th>
                    <th className="pb-3">Origem</th>
                    <th className="pb-3">Pedido</th>
                    <th className="pb-3">Cliente</th>
                    <th className="pb-3">Tipo</th>
                    <th className="pb-3 text-right tabular-nums">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedAuditItems.map((item) => (
                    <tr key={item.id} className="border-b border-white/[.05] last:border-0">
                      <td className="py-3 font-mono text-xs text-white/55">
                        {dateTime(item.lifecycle_at)}
                      </td>
                      <td className="py-3">
                        <p className="text-white/85">{item.offer_name}</p>
                        <p className="text-xs text-white/40">{item.product_name}</p>
                      </td>
                      <td className="py-3 text-xs text-cyan-100/70">{item.connection_name}</td>
                      <td className="py-3 font-mono text-xs text-white/60">{item.external_id}</td>
                      <td className="py-3">
                        <p className="text-white/75">{item.buyer?.name || '—'}</p>
                        <p className="text-xs text-white/35">{item.buyer?.email || '—'}</p>
                      </td>
                      <td className="py-3">
                        <span
                          className={
                            item.status === 'chargeback'
                              ? 'rounded-full border border-danger/20 bg-danger/[.08] px-2 py-1 text-[10px] uppercase text-danger'
                              : 'rounded-full border border-amber-300/20 bg-amber-400/[.08] px-2 py-1 text-[10px] uppercase text-amber-100'
                          }
                        >
                          {item.status === 'chargeback' ? 'Chargeback' : 'Reembolso'}
                        </span>
                      </td>
                      <td className="mono-num py-3 text-right tabular-nums text-danger">
                        {pick(item.brl_minor)}
                      </td>
                    </tr>
                  ))}
                  {!data?.items.length && (
                    <tr>
                      <td colSpan={7}>
                        <Empty />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {auditItems.length > AUDIT_PAGE_SIZE && (
              <nav
                aria-label="Paginação da auditoria de reembolsos"
                className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/[.08] pt-4"
              >
                <p className="text-xs text-white/50">
                  Exibindo {auditStart + 1}–
                  {Math.min(auditStart + AUDIT_PAGE_SIZE, auditItems.length)} de{' '}
                  {auditItems.length.toLocaleString('pt-BR')} pedidos
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={currentAuditPage === 1}
                    onClick={() => setAuditPage((page) => Math.max(1, page - 1))}
                  >
                    Anterior
                  </Button>
                  <span className="min-w-24 text-center text-xs text-white/55" aria-live="polite">
                    Página {currentAuditPage} de {auditPageCount}
                  </span>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11"
                    disabled={currentAuditPage === auditPageCount}
                    onClick={() => setAuditPage((page) => Math.min(auditPageCount, page + 1))}
                  >
                    Próxima
                  </Button>
                </div>
              </nav>
            )}
          </section>
        </>
      )}
    </div>
  );
}
function Kpi({
  icon: Icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: typeof RotateCcw;
  label: string;
  value: string;
  detail: string;
  tone: 'amber' | 'danger';
}) {
  const c = tone === 'danger' ? 'text-danger' : 'text-amber-100';
  return (
    <div className="rounded-2xl border border-white/[.09] bg-bg-elevated/70 p-5">
      <div className="flex items-center justify-between">
        <p className="hud-label">{label}</p>
        <Icon className={`h-4 w-4 ${c}`} />
      </div>
      <p className={`mono-num mt-3 text-2xl font-medium ${c}`}>{value}</p>
      <p className="mt-1 text-xs text-white/40">{detail}</p>
    </div>
  );
}
function Empty() {
  return (
    <div className="grid min-h-24 place-items-center text-center text-sm text-white/40">
      Nenhum reembolso ou chargeback neste filtro.
    </div>
  );
}
