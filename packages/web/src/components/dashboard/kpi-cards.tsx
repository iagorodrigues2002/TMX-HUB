'use client';

import type { ReactNode } from 'react';
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
import type { MetricsView } from '@/lib/api-client';

export function formatBRL(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return n.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    maximumFractionDigits: 2,
  });
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

interface KpiProps {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  /** Visual emphasis for revenue/sales (positive) vs spend (neutral). */
  tone?: 'default' | 'positive' | 'spend' | 'warn';
}

export function Kpi({ label, value, hint, icon, tone = 'default' }: KpiProps) {
  const accent =
    tone === 'positive'
      ? 'border-emerald-300/30 bg-emerald-300/[0.04]'
      : tone === 'spend'
        ? 'border-amber-300/30 bg-amber-300/[0.03]'
        : tone === 'warn'
          ? 'border-red-300/30 bg-red-300/[0.03]'
          : 'border-white/[0.06] bg-white/[0.02]';
  const iconColor =
    tone === 'positive'
      ? 'text-emerald-300'
      : tone === 'spend'
        ? 'text-amber-300'
        : tone === 'warn'
          ? 'text-red-300'
          : 'text-cyan-300';
  return (
    <div className={`rounded-md border p-4 ${accent}`}>
      <div className="flex items-center justify-between">
        <p className="hud-label">{label}</p>
        {icon && <span className={`shrink-0 ${iconColor}`}>{icon}</span>}
      </div>
      <p className="mt-2 text-[22px] font-semibold leading-tight text-white">{value}</p>
      {hint && <p className="mt-1 text-[11px] text-white/45">{hint}</p>}
    </div>
  );
}

export function KpiGrid({ metrics }: { metrics: MetricsView }) {
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
        value={formatBRL(metrics.revenue)}
        icon={<Receipt className="h-4 w-4" />}
        tone="positive"
      />
      <Kpi
        label="Investido"
        value={formatBRL(metrics.spend)}
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
        value={formatBRL(metrics.cpa)}
        icon={<Target className="h-4 w-4" />}
        hint="Custo por venda"
      />
      <Kpi
        label="CPA IC"
        value={formatBRL(metrics.icCpa)}
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
