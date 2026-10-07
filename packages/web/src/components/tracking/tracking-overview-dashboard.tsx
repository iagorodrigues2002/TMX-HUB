'use client';

import { TRACKING_DASHBOARD_STALE_TIME } from '@/components/tracking/tracking-query';
import { DataState } from '@/components/ui/data-state';
import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { formatMoney, useDisplayCurrency } from '@/lib/currency-preference';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard } from 'lucide-react';
import { useState } from 'react';

const SAO_PAULO_TIME_ZONE = 'America/Sao_Paulo';

function saoPauloDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SAO_PAULO_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

function integer(value: number | undefined) {
  return new Intl.NumberFormat('pt-BR').format(value ?? 0);
}

export function TrackingOverviewDashboard() {
  const [from, setFrom] = useState(() => saoPauloDate());
  const [to, setTo] = useState(() => saoPauloDate());
  const [displayCurrency] = useDisplayCurrency();
  const overview = useQuery({
    queryKey: ['tracking-overview', from, to],
    queryFn: () => apiClient.getTrackingOverview(from, to),
    retry: false,
    staleTime: TRACKING_DASHBOARD_STALE_TIME,
  });

  const pick = (brlMinor: string | undefined, usdMinor: string | undefined) =>
    formatMoney(displayCurrency === 'USD' ? usdMinor : brlMinor, displayCurrency);

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08]">
              <LayoutDashboard className="h-4.5 w-4.5 text-cyan-300" />
            </div>
            <div>
              <p className="hud-label">Visão geral · separada por conta</p>
              <p className="mt-1 text-sm text-white/50">
                Cada conta tem seus próprios totais. Dados financeiros nunca são misturados.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label htmlFor="overview-from" className="space-y-1">
              <span className="hud-label block">De</span>
              <Input
                id="overview-from"
                type="date"
                value={from}
                max={to}
                onChange={(event) => setFrom(event.target.value || saoPauloDate())}
                className="h-9 w-[160px]"
              />
            </label>
            <label htmlFor="overview-to" className="space-y-1">
              <span className="hud-label block">Até</span>
              <Input
                id="overview-to"
                type="date"
                value={to}
                min={from}
                max={saoPauloDate()}
                onChange={(event) => setTo(event.target.value || saoPauloDate())}
                className="h-9 w-[160px]"
              />
            </label>
          </div>
        </div>
      </section>

      {overview.isLoading ? (
        <DataState variant="loading" title="Carregando visão geral…" />
      ) : overview.isError && !overview.data ? (
        <DataState
          variant="error"
          title="Não foi possível carregar a visão geral"
          description="Os filtros foram preservados. Tente consultar este período novamente."
          isRetrying={overview.isFetching}
          onRetry={() => void overview.refetch()}
        />
      ) : !overview.data?.accounts.length ? (
        <DataState
          variant="empty"
          title="Nenhum pedido pago neste período"
          description="Altere as datas para consultar outra janela de vendas."
        />
      ) : (
        overview.data.accounts.map((account) => {
          const totals = account.totals;
          return (
            <section
              key={account.owner_id}
              className="space-y-4 rounded-xl border border-cyan-300/[0.16] bg-cyan-300/[0.025] p-3 sm:p-4"
            >
              <header className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-300/[0.12] px-1 pb-3">
                <div>
                  <p className="hud-label">Conta</p>
                  <h2 className="mt-1 text-base font-semibold text-white">{account.owner_name}</h2>
                </div>
                <p className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1 text-[11px] text-cyan-100/75">
                  {integer(account.offers.length)}{' '}
                  {account.offers.length === 1 ? 'oferta' : 'ofertas'}
                </p>
              </header>
              <div data-surface="tracking" className="tmx-kpi rounded-lg">
                <div className="tmx-kpi-tier2 tmx-kpi-tier2-six">
                  <div className="tmx-kpi-strip-cell">
                    <div className="tmx-kpi-strip-head">
                      <span className="tmx-kpi-strip-label">Bruto</span>
                    </div>
                    <p className="mono-num tmx-kpi-strip-value">
                      {pick(totals?.gross_revenue_brl_minor, totals?.gross_revenue_usd_minor)}
                    </p>
                    <p className="tmx-kpi-strip-detail">{integer(totals?.paid_orders)} pedidos</p>
                  </div>
                  <div className="tmx-kpi-strip-cell">
                    <div className="tmx-kpi-strip-head">
                      <span className="tmx-kpi-strip-label">Vendas com erro</span>
                    </div>
                    <p className="mono-num tmx-kpi-strip-value text-amber-200">
                      {pick(totals?.failed_revenue_brl_minor, totals?.failed_revenue_usd_minor)}
                    </p>
                    <p className="tmx-kpi-strip-detail">
                      {integer(totals?.failed_orders)} falhas, recusadas ou canceladas
                    </p>
                  </div>
                  <div className="tmx-kpi-strip-cell">
                    <div className="tmx-kpi-strip-head">
                      <span className="tmx-kpi-strip-label">Reembolsos + chargeback</span>
                    </div>
                    <p className="mono-num tmx-kpi-strip-value">
                      {pick(
                        String(
                          Number(totals?.refunded_revenue_brl_minor ?? 0) +
                            Number(totals?.chargeback_revenue_brl_minor ?? 0),
                        ),
                        String(
                          Number(totals?.refunded_revenue_usd_minor ?? 0) +
                            Number(totals?.chargeback_revenue_usd_minor ?? 0),
                        ),
                      )}
                    </p>
                    <p className="tmx-kpi-strip-detail">
                      {integer((totals?.refunded_orders ?? 0) + (totals?.chargeback_orders ?? 0))}{' '}
                      pedidos
                    </p>
                  </div>
                  <div className="tmx-kpi-strip-cell">
                    <div className="tmx-kpi-strip-head">
                      <span className="tmx-kpi-strip-label">Taxas</span>
                    </div>
                    <p className="mono-num tmx-kpi-strip-value">
                      {pick(totals?.fees_brl_minor, totals?.fees_usd_minor)}
                    </p>
                  </div>
                  <div className="tmx-kpi-strip-cell">
                    <div className="tmx-kpi-strip-head">
                      <span className="tmx-kpi-strip-label">Em reserva (retido)</span>
                    </div>
                    <p className="mono-num tmx-kpi-strip-value">
                      {pick(totals?.reserve_brl_minor, totals?.reserve_usd_minor)}
                    </p>
                    <p className="tmx-kpi-strip-detail">soma ao líquido quando liberar</p>
                  </div>
                  <div className="tmx-kpi-strip-cell">
                    <div className="tmx-kpi-strip-head">
                      <span className="tmx-kpi-strip-label">Taxa de reembolso/chargeback</span>
                    </div>
                    <p className="mono-num tmx-kpi-strip-value text-danger">
                      {pick(
                        totals?.refund_chargeback_fee_brl_minor,
                        totals?.refund_chargeback_fee_usd_minor,
                      )}
                    </p>
                    <p className="tmx-kpi-strip-detail">
                      {integer(totals?.refund_chargeback_fee_count)} ocorrências · US$ 27 cada
                    </p>
                  </div>
                </div>
                <div className="tmx-kpi-tier1">
                  <div className="tmx-kpi-hero">
                    <p className="tmx-kpi-hero-eyebrow">Disponível real agora</p>
                    <p className="mono-num tmx-kpi-hero-value tmx-kpi-hero-value-currency">
                      {pick(totals?.net_available_brl_minor, totals?.net_available_usd_minor)}
                    </p>
                    <div className="tmx-kpi-hero-sat">
                      <span className="tmx-kpi-sat-tag">reserva e taxa de R/CB descontadas</span>
                    </div>
                  </div>
                  <div className="tmx-kpi-hero">
                    <p className="tmx-kpi-hero-eyebrow">Líquido total (reserva já liberada)</p>
                    <p className="mono-num tmx-kpi-hero-value tmx-kpi-hero-value-currency">
                      {pick(totals?.net_revenue_brl_minor, totals?.net_revenue_usd_minor)}
                    </p>
                    <div className="tmx-kpi-hero-sat">
                      <span className="tmx-kpi-sat-tag">disponível agora</span>
                      <span className="mono-num tmx-kpi-sat-value">
                        {pick(totals?.net_available_brl_minor, totals?.net_available_usd_minor)}
                      </span>
                      <span className="tmx-kpi-sat-sep" aria-hidden />
                      <span className="tmx-kpi-sat-tag">+ reserva</span>
                      <span className="mono-num tmx-kpi-sat-value">
                        {pick(totals?.reserve_brl_minor, totals?.reserve_usd_minor)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
                <table className="w-full min-w-[820px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-white/[0.08] text-left text-[10px] uppercase tracking-wider text-white/40">
                      <th className="p-3 font-medium">Oferta</th>
                      <th className="p-3 text-right font-medium tabular-nums">Pedidos</th>
                      <th className="p-3 text-right font-medium tabular-nums">Bruto</th>
                      <th className="p-3 text-right font-medium tabular-nums">Com erro</th>
                      <th className="p-3 text-right font-medium tabular-nums">Reembolsos</th>
                      <th className="p-3 text-right font-medium tabular-nums">Chargeback</th>
                      <th className="p-3 text-right font-medium tabular-nums">Taxas</th>
                      <th className="p-3 text-right font-medium tabular-nums">Taxa R/CB</th>
                      <th className="p-3 text-right font-medium tabular-nums">Em reserva</th>
                      <th className="p-3 text-right font-medium tabular-nums">Líquido agora</th>
                      <th className="p-3 text-right font-medium tabular-nums">Líquido total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {account.offers.map((offer) => (
                      <tr
                        key={offer.offer_id}
                        className="border-b border-white/[0.05] text-white/75 last:border-0"
                      >
                        <td className="p-3 font-medium text-white/90">{offer.offer_name}</td>
                        <td className="mono-num p-3 text-right tabular-nums">
                          {integer(offer.paid_orders)}
                        </td>
                        <td className="mono-num p-3 text-right tabular-nums">
                          {pick(offer.gross_revenue_brl_minor, offer.gross_revenue_usd_minor)}
                        </td>
                        <td className="mono-num p-3 text-right tabular-nums text-amber-200/80">
                          <span className="block">
                            {pick(offer.failed_revenue_brl_minor, offer.failed_revenue_usd_minor)}
                          </span>
                          <span className="mt-1 block text-[10px] text-white/35">
                            {integer(offer.failed_orders)} pedidos
                          </span>
                        </td>
                        <td className="mono-num p-3 text-right tabular-nums text-amber-200/80">
                          {pick(offer.refunded_revenue_brl_minor, offer.refunded_revenue_usd_minor)}
                        </td>
                        <td className="mono-num p-3 text-right tabular-nums text-danger/80">
                          {pick(
                            offer.chargeback_revenue_brl_minor,
                            offer.chargeback_revenue_usd_minor,
                          )}
                        </td>
                        <td className="mono-num p-3 text-right tabular-nums text-white/50">
                          {pick(offer.fees_brl_minor, offer.fees_usd_minor)}
                        </td>
                        <td className="mono-num p-3 text-right tabular-nums text-danger/80">
                          <span className="block">
                            {pick(
                              offer.refund_chargeback_fee_brl_minor,
                              offer.refund_chargeback_fee_usd_minor,
                            )}
                          </span>
                          <span className="mt-1 block text-[10px] text-white/35">
                            {integer(offer.refund_chargeback_fee_count)} ocorrências
                          </span>
                        </td>
                        <td className="mono-num p-3 text-right tabular-nums text-white/50">
                          {pick(offer.reserve_brl_minor, offer.reserve_usd_minor)}
                        </td>
                        <td className="mono-num p-3 text-right font-medium tabular-nums text-cyan-200">
                          {pick(offer.net_available_brl_minor, offer.net_available_usd_minor)}
                        </td>
                        <td className="mono-num p-3 text-right font-medium tabular-nums text-emerald-200">
                          {pick(offer.net_revenue_brl_minor, offer.net_revenue_usd_minor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
