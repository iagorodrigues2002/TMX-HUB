'use client';

import {
  formatCurrency,
  formatInt,
  formatPercent,
  formatRoas,
} from '@/components/dashboard/kpi-cards';
import type { MetricsView } from '@/lib/api-client';

export function WindowMetrics({ metrics, currency }: { metrics: MetricsView; currency: string }) {
  return (
    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
      <div>
        <dt className="hud-label">Investido</dt>
        <dd className="mt-1 font-mono text-base text-amber-300">
          {formatCurrency(metrics.spend, currency)}
        </dd>
      </div>
      <div>
        <dt className="hud-label">Vendas</dt>
        <dd className="mt-1 font-mono text-base text-emerald-300">{formatInt(metrics.sales)}</dd>
      </div>
      <div>
        <dt className="hud-label">CPA</dt>
        <dd className="mt-1 font-mono text-base text-white/85">
          {formatCurrency(metrics.cpa, currency)}
        </dd>
      </div>
      <div>
        <dt className="hud-label">IC</dt>
        <dd className="mt-1 font-mono text-base text-cyan-300">{formatInt(metrics.ic)}</dd>
      </div>
      <div>
        <dt className="hud-label">Faturamento</dt>
        <dd className="mt-1 font-mono text-base text-emerald-300">
          {formatCurrency(metrics.revenue, currency)}
        </dd>
      </div>
      <div>
        <dt className="hud-label">CPA IC</dt>
        <dd className="mt-1 font-mono text-base text-white/85">
          {formatCurrency(metrics.icCpa, currency)}
        </dd>
      </div>
      <div>
        <dt className="hud-label">Conv. IC</dt>
        <dd className="mt-1 font-mono text-base text-white/85">
          {formatPercent(metrics.conversionRate)}
        </dd>
      </div>
      <div>
        <dt className="hud-label">ROAS</dt>
        <dd className="mt-1 font-mono text-base text-cyan-300">{formatRoas(metrics.roas)}</dd>
      </div>
    </dl>
  );
}
