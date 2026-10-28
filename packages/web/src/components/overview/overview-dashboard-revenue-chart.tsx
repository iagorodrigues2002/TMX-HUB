'use client';

import { formatCurrency, formatInt } from '@/components/dashboard/kpi-cards';
import type { ChartPoint } from './overview-dashboard-support';

export function RevenueChart({
  title,
  description,
  emptyMessage,
  points,
  currency,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  points: ChartPoint[];
  currency: string;
}) {
  const maximum = Math.max(...points.map((point) => point.value), 1);

  return (
    <section className="glass-card overflow-hidden p-0">
      <header className="border-b border-white/[0.06] px-4 py-3">
        <h4 className="text-sm font-semibold text-white">{title}</h4>
        <p className="mt-1 text-xs leading-5 text-white/45">{description}</p>
      </header>
      {points.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-white/45">{emptyMessage}</p>
      ) : (
        <>
          <div className="overflow-x-auto px-4 pb-4 pt-5">
            <div
              aria-hidden="true"
              className="grid h-56 items-end gap-2"
              style={{
                gridTemplateColumns: `repeat(${points.length}, minmax(42px, 1fr))`,
                minWidth: `${Math.max(points.length * 54, 560)}px`,
              }}
            >
              {points.map((point) => (
                <div key={point.key} className="flex h-full min-w-0 flex-col justify-end gap-2">
                  <div className="flex min-h-0 flex-1 items-end justify-center">
                    <div
                      className="w-full max-w-10 rounded-t-md border border-cyan-200/20 bg-cyan-300/35"
                      style={{
                        height: `${point.value > 0 ? Math.max((point.value / maximum) * 100, 4) : 1}%`,
                      }}
                      title={`${point.label}: ${formatCurrency(point.value, currency)} · ${formatInt(point.secondary)} vendas`}
                    />
                  </div>
                  <div className="text-center">
                    <p className="font-mono text-[10px] text-white/55">{point.label}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-emerald-200/75">
                      {formatInt(point.secondary)} v.
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <table className="sr-only">
            <caption>{title}</caption>
            <thead>
              <tr>
                <th>Período</th>
                <th>Receita</th>
                <th>Vendas</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.key}>
                  <td>{point.label}</td>
                  <td>{formatCurrency(point.value, currency)}</td>
                  <td>{formatInt(point.secondary)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
