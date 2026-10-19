'use client';

import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { type TrackingPeriod, apiClient } from '@/lib/api-client';
import { usePrivacy } from '@/lib/privacy-context';
import { useQuery } from '@tanstack/react-query';
import { Metric, ago, panel, today } from './refunds-dashboard-support';
import './refunds-dashboard.css';
import { refundMoney, refundPercent } from './refunds-visualizations';

export function TrackingRefundsSummary({
  offerId,
  period,
}: {
  offerId: string;
  period?: TrackingPeriod;
}) {
  const { isPrivate } = usePrivacy();
  const from = period?.from ?? ago(29);
  const to = period?.to ?? today();
  const report = useQuery({
    queryKey: ['refunds-dashboard', 'tracking-summary', from, to, offerId],
    queryFn: () => apiClient.getRefundsDashboard(from, to, offerId),
    retry: false,
  });
  if (report.isLoading)
    return <DataState variant="loading" title="Carregando resumo de devoluções…" />;
  if (!report.data || report.isError)
    return (
      <DataState
        variant="error"
        title="Não foi possível carregar o resumo financeiro"
        onRetry={() => void report.refetch()}
      />
    );
  const t = report.data.totals;
  return (
    <section className={panel}>
      <div className="flex flex-wrap justify-between gap-3">
        <div>
          <h2 className="font-semibold text-white">Reembolsos e chargebacks</h2>
          <p className="mt-1 text-xs text-white/50">
            {from} a {to} · valores em BRL
          </p>
        </div>
        <Button asChild variant="outline">
          <a href={`/reembolsos?offer_id=${encodeURIComponent(offerId)}`}>
            Abrir relatório completo
          </a>
        </Button>
      </div>
      <dl className="mt-5 grid gap-5 sm:grid-cols-3">
        <Metric
          label="Reembolsos e chargebacks"
          value={refundMoney(t.brl_minor, isPrivate)}
          detail={`${t.count} devoluções · ${refundPercent(t.rate_pct, isPrivate)} do faturamento`}
        />
        <Metric
          label="Multas"
          value={refundMoney(t.fee_brl_minor, isPrivate)}
          detail="Conforme configuração de cada gateway"
        />
        <Metric
          label="Impacto total"
          value={refundMoney(t.impact_brl_minor, isPrivate)}
          detail={`${refundPercent(t.impact_pct, isPrivate)} do faturamento, incluindo multas`}
        />
      </dl>
      {(t.missing_brl_orders > 0 || t.missing_fee_orders > 0) && (
        <p className="mt-3 text-sm text-amber-200">
          Total parcial: há conversões ou multas pendentes de configuração.
        </p>
      )}
    </section>
  );
}
export { RefundsDashboard } from './refunds-dashboard-refunds-dashboard';
