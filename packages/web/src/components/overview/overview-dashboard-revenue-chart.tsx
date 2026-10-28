'use client';
import { formatCurrency, formatInt } from '@/components/dashboard/kpi-cards';
import { type ReactNode, useId, useState } from 'react';
import type { ChartPoint } from './overview-dashboard-support';
import styles from './revenue-chart.module.css';

export function RevenueChart({
  title,
  description,
  emptyMessage,
  points,
  currency,
  animated = false,
  controls,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  points: ChartPoint[];
  currency: string;
  animated?: boolean;
  controls?: ReactNode;
}) {
  const id = useId();
  const [active, setActive] = useState<number | null>(null);
  const maximum = Math.max(...points.map((point) => point.value), 1);
  const x = (index: number) => 68 + (index * 628) / Math.max(points.length - 1, 1);
  const y = (value: number) => 230 - (value / maximum) * 190;
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' ');
  const selected = active === null ? undefined : points[active];
  return (
    <section className={`glass-card overflow-hidden p-0 ${styles.chart}`} data-animated={animated}>
      <header className="border-b border-border px-4 py-3">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        {controls}
      </header>
      {points.length === 0 ? (
        <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
      ) : (
        <>
          <div className={styles.summary} aria-live="polite">
            <span>{selected ? selected.label : 'Total no período'}</span>
            <strong>
              {formatCurrency(
                selected ? selected.value : points.reduce((sum, p) => sum + p.value, 0),
                currency,
              )}
            </strong>
            <span>
              {formatInt(
                selected ? selected.secondary : points.reduce((sum, p) => sum + p.secondary, 0),
              )}{' '}
              vendas
            </span>
          </div>
          <svg
            className={styles.plot}
            viewBox="0 0 720 270"
            // biome-ignore lint/a11y/useSemanticElements: SVG groups interactive chart marks, not form controls.
            role="group"
            aria-label={`${title}: receita e vendas por horário`}
          >
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="currentColor" stopOpacity=".3" />
                <stop offset="100%" stopColor="currentColor" stopOpacity=".01" />
              </linearGradient>
            </defs>
            {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
              <g key={fraction} className={styles.grid}>
                <line x1="68" x2="696" y1={y(maximum * fraction)} y2={y(maximum * fraction)} />
                <text x="60" y={y(maximum * fraction) + 4} textAnchor="end">
                  {new Intl.NumberFormat('pt-BR', {
                    notation: 'compact',
                    maximumFractionDigits: 1,
                  }).format(maximum * fraction)}
                </text>
              </g>
            ))}
            <g className={styles.series} key={points.map((p) => p.value).join(':')}>
              <path d={`${line} L${x(points.length - 1)},230 L68,230 Z`} fill={`url(#${id})`} />
              <path d={line} className={styles.glow} />
              <path d={line} className={styles.line} />
            </g>
            {points.map((p, i) => (
              <g key={p.key}>
                {(i % Math.max(1, Math.ceil(points.length / 8)) === 0 ||
                  i === points.length - 1) && (
                  <text className={styles.label} x={x(i)} y="252" textAnchor="middle">
                    {p.label}
                  </text>
                )}
                <circle
                  className={styles.dot}
                  cx={x(i)}
                  cy={y(p.value)}
                  r={active === i ? 5 : 2.5}
                />
                <rect
                  x={x(i) - 12}
                  y="25"
                  width="24"
                  height="210"
                  fill="transparent"
                  tabIndex={0}
                  // biome-ignore lint/a11y/useSemanticElements: SVG mark implements focus, touch and Enter/Space activation.
                  role="button"
                  aria-label={`${p.label}: ${formatCurrency(p.value, currency)}, ${formatInt(p.secondary)} vendas`}
                  onMouseEnter={() => setActive(i)}
                  onMouseLeave={() => setActive(null)}
                  onFocus={() => setActive(i)}
                  onBlur={() => setActive(null)}
                  onClick={() => setActive(i)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setActive(i);
                    }
                  }}
                >
                  <title>
                    {p.label}: {formatCurrency(p.value, currency)} · {formatInt(p.secondary)} vendas
                  </title>
                </rect>
              </g>
            ))}
          </svg>
          <p className="px-4 pb-4 text-xs text-muted-foreground">
            Receita ({currency}) · Passe o mouse, toque ou use Tab nos horários.
          </p>
          <table className="sr-only">
            <caption>{title}</caption>
            <thead>
              <tr>
                <th>Horário</th>
                <th>Receita</th>
                <th>Vendas</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p) => (
                <tr key={p.key}>
                  <td>{p.label}</td>
                  <td>{formatCurrency(p.value, currency)}</td>
                  <td>{p.secondary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
