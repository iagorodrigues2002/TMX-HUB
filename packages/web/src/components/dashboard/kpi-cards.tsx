'use client';

import { Kpi } from '@/components/ui/kpi';
import type { MetricsView } from '@/lib/api-client';
import {
  CircleDollarSign,
  CreditCard,
  Receipt,
  ShoppingCart,
  Target,
  TrendingUp,
  Wallet,
  Zap,
} from 'lucide-react';

export function formatCurrency(n: number | null | undefined, currency = 'BRL'): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  });
}

export function formatBRL(n: number | null | undefined): string {
  return formatCurrency(n, 'BRL');
}

export function formatInt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return Math.round(n).toLocaleString('pt-BR');
}

export function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

export function formatRoas(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n.toFixed(2)}x`;
}

export function KpiGrid({
  metrics,
  currency = 'BRL',
}: { metrics: MetricsView; currency?: string }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <Kpi
        label="Vendas"
        value={formatInt(metrics.sales)}
        icon={<ShoppingCart className="h-4 w-4" />}
        tone="positive"
      />
      <Kpi
        label="Faturamento"
        value={formatCurrency(metrics.revenue, currency)}
        icon={<Receipt className="h-4 w-4" />}
        tone="positive"
      />
      <Kpi
        label="Investido"
        value={formatCurrency(metrics.spend, currency)}
        icon={<Wallet className="h-4 w-4" />}
        tone="spend"
      />
      <Kpi
        label="IC"
        value={formatInt(metrics.ic)}
        icon={<CreditCard className="h-4 w-4" />}
        hint="Initiate Checkout"
      />
      <Kpi
        label="CPA"
        value={formatCurrency(metrics.cpa, currency)}
        icon={<Target className="h-4 w-4" />}
        hint="Custo por venda"
      />
      <Kpi
        label="CPA IC"
        value={formatCurrency(metrics.icCpa, currency)}
        icon={<CircleDollarSign className="h-4 w-4" />}
        hint="Custo por checkout iniciado"
      />
      <Kpi
        label="Conv. Checkout"
        value={formatPercent(metrics.conversionRate)}
        icon={<Zap className="h-4 w-4" />}
        hint="Vendas / IC"
      />
      <Kpi
        label="ROAS"
        value={formatRoas(metrics.roas)}
        icon={<TrendingUp className="h-4 w-4" />}
        tone={metrics.roas !== null && metrics.roas >= 1 ? 'positive' : 'warn'}
      />
    </div>
  );
}
