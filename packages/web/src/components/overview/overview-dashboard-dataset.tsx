'use client';

import { formatCurrency, formatInt } from '@/components/dashboard/kpi-cards';
import { Kpi } from '@/components/ui/kpi';
import { formatRefundRevenuePercentage } from '@/lib/overview-financial';
import { usePrivacy } from '@/lib/privacy-context';
import { CreditCard, Eye, MousePointerClick, Percent, Receipt, ShoppingCart } from 'lucide-react';
import { RevenueChart } from './overview-dashboard-revenue-chart';
import {
  type OverviewDataset,
  formatCompactNumber,
  formatConversionRate,
} from './overview-dashboard-support';

export function Dataset({ dataset }: { dataset: OverviewDataset }) {
  const { isPrivate } = usePrivacy();
  return (
    <section
      className="space-y-4 rounded-xl border border-cyan-300/[0.14] bg-cyan-300/[0.025] p-3 sm:p-4"
      data-overview-dataset={dataset.key}
    >
      <header className="animate-[tmx-reveal_220ms_cubic-bezier(0,0,0.2,1)_50ms_both] flex flex-wrap items-center justify-between gap-3 border-b border-cyan-300/[0.1] px-1 pb-3 motion-reduce:animate-none">
        <div>
          <p className="hud-label">Escopo dos dados</p>
          <h3 className="mt-1 text-base font-semibold text-white">{dataset.label}</h3>
        </div>
        <p className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-3 py-1 text-[11px] text-cyan-100/75">
          {dataset.offerCount} {dataset.offerCount === 1 ? 'oferta' : 'ofertas'} ·{' '}
          {dataset.currency}
        </p>
      </header>

      <div className="animate-[tmx-reveal_220ms_cubic-bezier(0,0,0.2,1)_100ms_both] grid grid-cols-1 gap-3 motion-reduce:animate-none sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          label="Cliques"
          value={formatInt(dataset.clicks)}
          countUp={{ value: dataset.clicks, format: formatInt }}
          hint="Tráfego de mídia"
          icon={<MousePointerClick className="h-4 w-4" />}
        />
        <Kpi
          label="PageView"
          value={formatInt(dataset.pageViews)}
          countUp={{ value: dataset.pageViews, format: formatInt }}
          hint="Visualizações rastreadas"
          icon={<Eye className="h-4 w-4" />}
        />
        <Kpi
          label="Initiate Checkout"
          value={formatInt(dataset.totals.ic)}
          countUp={{ value: dataset.totals.ic, format: formatInt }}
          hint="Checkouts iniciados"
          icon={<CreditCard className="h-4 w-4" />}
        />
        <Kpi
          label="Vendas"
          value={formatCompactNumber(dataset.totals.sales)}
          countUp={{ value: dataset.totals.sales, format: formatCompactNumber }}
          hint="Pedidos pagos"
          icon={<ShoppingCart className="h-4 w-4" />}
          tone="positive"
        />
        <Kpi
          label="Receita bruta"
          value={formatCurrency(dataset.totals.revenue, 'BRL')}
          countUp={{
            value: dataset.totals.revenue,
            format: (value) => formatCurrency(value, 'BRL'),
          }}
          hint="Receita bruta paga"
          icon={<Receipt className="h-4 w-4" />}
          tone="positive"
        />
        <Kpi
          label="Taxa de conversão"
          value={formatConversionRate(dataset.conversionRate)}
          countUp={
            dataset.conversionRate === null
              ? undefined
              : { value: dataset.conversionRate, format: formatConversionRate }
          }
          hint="Vendas / PageView"
          icon={<Percent className="h-4 w-4" />}
        />
      </div>

      <div
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3"
        aria-label="Taxas e receita líquida"
      >
        {[
          ['Taxas do gateway', dataset.finance?.fees, 'Percentual + tarifa por transação'],
          [
            'Reembolsos e chargebacks',
            dataset.finance?.refunds,
            `${isPrivate ? '****' : formatRefundRevenuePercentage(dataset.finance?.refundPercentage ?? null)} do faturamento bruto do período`,
          ],
          [
            'Impacto total das devoluções',
            dataset.finance?.impact,
            `${isPrivate ? '****' : formatRefundRevenuePercentage(dataset.finance?.impactPercentage ?? null)} do bruto · inclui multas por gateway`,
          ],
          [
            'Receita líquida estimada',
            dataset.finance?.net,
            'Após taxas, devoluções e encargos; antes da reserva',
          ],
          [
            'Reserva retida estimada',
            dataset.finance?.reserve,
            'VendePay: exclui compras devolvidas; retenção estimada, não é despesa definitiva',
          ],
          [
            'Após retenção da reserva',
            dataset.finance?.available,
            'Estimativa; não representa saldo liberado para saque',
          ],
        ].map(([label, value, hint]) => (
          <Kpi
            key={String(label)}
            label={String(label)}
            value={typeof value === 'number' ? formatCurrency(value, 'BRL') : '—'}
            hint={String(hint)}
            icon={<Receipt className="h-4 w-4" />}
          />
        ))}
      </div>
      <p className="text-xs text-white/45">
        Reembolsos e chargebacks são unificados pela data da devolução e podem incluir compras
        anteriores. O percentual compara esse fluxo com o bruto do período, não com uma coorte de
        compras. Taxas e retenções calculadas pelo modelo financeiro do TMX. A cotação e as tarifas
        efetivamente liquidadas pelo gateway podem diferir.
      </p>
      {Boolean(dataset.finance?.missingFeeOperations) && (
        <output className="block rounded-lg border border-amber-300/20 bg-amber-300/5 p-3 text-sm text-amber-200">
          Líquido indisponível: {dataset.finance?.missingFeeOperations} operações sem taxas ou
          cotação configuradas. Configure o gateway correspondente. As taxas da VendePay não são
          usadas como substituição.
        </output>
      )}

      <div className="animate-[tmx-reveal_220ms_cubic-bezier(0,0,0.2,1)_150ms_both] grid gap-4 motion-reduce:animate-none xl:grid-cols-2">
        <RevenueChart
          title="Série diária"
          description="Receita por dia; o rodapé de cada barra mostra as vendas."
          emptyMessage="Nenhum snapshot diário disponível neste período."
          points={dataset.daily}
          currency={dataset.currency}
        />
        <RevenueChart
          title="Intradiário"
          description="Receita por janela de duas horas, consolidada no período selecionado."
          emptyMessage="A coleta intradiária ainda não produziu janelas completas."
          points={dataset.intraday}
          currency={dataset.currency}
        />
      </div>
    </section>
  );
}
