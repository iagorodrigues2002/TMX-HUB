'use client';

import { Input } from '@/components/ui/input';
import { apiClient } from '@/lib/api-client';
import { formatMoney } from '@/lib/currency-preference';
import { useQuery } from '@tanstack/react-query';
import { LayoutDashboard, Loader2 } from 'lucide-react';
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
  const [date, setDate] = useState(() => saoPauloDate());
  const overview = useQuery({
    queryKey: ['tracking-overview', date],
    queryFn: () => apiClient.getTrackingOverview(date),
    retry: false,
  });

  const totals = overview.data?.totals;

  return (
    <div className="space-y-5">
      <section className="rounded-lg border border-white/[0.08] bg-white/[0.025] p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-cyan-300/25 bg-cyan-300/[0.08]">
              <LayoutDashboard className="h-4.5 w-4.5 text-cyan-300" />
            </div>
            <div>
              <p className="hud-label">Visão geral · todas as ofertas</p>
              <p className="mt-1 text-sm text-white/50">
                Bruto, reembolsos, chargebacks, taxas e líquido agrupados por oferta.
              </p>
            </div>
          </div>
          <label htmlFor="overview-date" className="space-y-1">
            <span className="hud-label block">Data</span>
            <Input
              id="overview-date"
              type="date"
              value={date}
              max={saoPauloDate()}
              onChange={(event) => setDate(event.target.value || saoPauloDate())}
              className="h-9 w-[160px]"
            />
          </label>
        </div>
      </section>

      {overview.isLoading ? (
        <div className="flex items-center gap-2 p-8 text-sm text-white/45">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando visão geral…
        </div>
      ) : !overview.data?.offers.length ? (
        <div className="rounded-lg border border-white/[0.08] bg-white/[0.02] p-8 text-center text-sm text-white/40">
          Nenhum pedido pago neste dia em nenhuma oferta.
        </div>
      ) : (
        <>
          <div data-surface="tracking" className="tmx-kpi rounded-lg">
            <div className="tmx-kpi-tier2">
              <div className="tmx-kpi-strip-cell">
                <div className="tmx-kpi-strip-head">
                  <span className="tmx-kpi-strip-label">Bruto</span>
                </div>
                <p className="mono-num tmx-kpi-strip-value">
                  {formatMoney(totals?.gross_revenue_brl_minor, 'BRL')}
                </p>
                <p className="tmx-kpi-strip-detail">{integer(totals?.paid_orders)} pedidos</p>
              </div>
              <div className="tmx-kpi-strip-cell">
                <div className="tmx-kpi-strip-head">
                  <span className="tmx-kpi-strip-label">Reembolsos + chargeback</span>
                </div>
                <p className="mono-num tmx-kpi-strip-value">
                  {formatMoney(
                    String(
                      Number(totals?.refunded_revenue_brl_minor ?? 0) +
                        Number(totals?.chargeback_revenue_brl_minor ?? 0),
                    ),
                    'BRL',
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
                  {formatMoney(totals?.fees_brl_minor, 'BRL')}
                </p>
              </div>
              <div className="tmx-kpi-strip-cell">
                <div className="tmx-kpi-strip-head">
                  <span className="tmx-kpi-strip-label">Em reserva</span>
                </div>
                <p className="mono-num tmx-kpi-strip-value">
                  {formatMoney(totals?.reserve_brl_minor, 'BRL')}
                </p>
              </div>
            </div>
            <div className="tmx-kpi-tier1 tmx-kpi-tier1-single">
              <div className="tmx-kpi-hero">
                <p className="tmx-kpi-hero-eyebrow">Líquido total (após taxas e reembolsos)</p>
                <p className="mono-num tmx-kpi-hero-value tmx-kpi-hero-value-currency">
                  {formatMoney(totals?.net_revenue_brl_minor, 'BRL')}
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto rounded-lg border border-white/[0.08]">
            <table className="w-full min-w-[720px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-white/[0.08] text-left text-[10px] uppercase tracking-wider text-white/40">
                  <th className="p-3 font-medium">Oferta</th>
                  <th className="p-3 font-medium">Pedidos</th>
                  <th className="p-3 font-medium">Bruto</th>
                  <th className="p-3 font-medium">Reembolsos</th>
                  <th className="p-3 font-medium">Chargeback</th>
                  <th className="p-3 font-medium">Taxas</th>
                  <th className="p-3 font-medium">Em reserva</th>
                  <th className="p-3 font-medium">Líquido</th>
                </tr>
              </thead>
              <tbody>
                {overview.data.offers.map((offer) => (
                  <tr
                    key={offer.offer_id}
                    className="border-b border-white/[0.05] text-white/75 last:border-0"
                  >
                    <td className="p-3 font-medium text-white/90">{offer.offer_name}</td>
                    <td className="mono-num p-3">{integer(offer.paid_orders)}</td>
                    <td className="mono-num p-3">
                      {formatMoney(offer.gross_revenue_brl_minor, 'BRL')}
                    </td>
                    <td className="mono-num p-3 text-amber-200/80">
                      {formatMoney(offer.refunded_revenue_brl_minor, 'BRL')}
                    </td>
                    <td className="mono-num p-3 text-red-200/80">
                      {formatMoney(offer.chargeback_revenue_brl_minor, 'BRL')}
                    </td>
                    <td className="mono-num p-3 text-white/50">
                      {formatMoney(offer.fees_brl_minor, 'BRL')}
                    </td>
                    <td className="mono-num p-3 text-white/50">
                      {formatMoney(offer.reserve_brl_minor, 'BRL')}
                    </td>
                    <td className="mono-num p-3 font-medium text-emerald-200">
                      {formatMoney(offer.net_revenue_brl_minor, 'BRL')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
