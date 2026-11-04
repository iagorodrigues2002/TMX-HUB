'use client';

import { formatCurrency, formatInt } from '@/components/dashboard/kpi-cards';
import { formatRevenueTick, hourlyCeiling, hourlyGeometry } from '@/components/ui/revenue-geometry';
import { useDataPending } from '@/lib/data-pending';
import { interpolateCount } from '@/lib/motion-session';
import { type ReactNode, useEffect, useId, useRef, useState } from 'react';
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
  privateMode = false,
}: {
  title: string;
  description: string;
  emptyMessage: string;
  points: ChartPoint[];
  currency: string;
  animated?: boolean;
  controls?: ReactNode;
  privateMode?: boolean;
}) {
  const id = useId();
  const pending = useDataPending();
  const plotRef = useRef<HTMLDivElement>(null);
  const targets = useRef<(HTMLButtonElement | null)[]>([]);
  const [width, setWidth] = useState(600);
  const [active, setActive] = useState<number | null>(null);
  const signature = JSON.stringify(points.map((point) => point.value));
  const [plot, setPlot] = useState(() => ({
    values: points.map((point) => point.value),
    ceiling: hourlyCeiling(points.map((point) => point.value)),
  }));
  const current = useRef(plot);

  useEffect(() => {
    if (!points.length || !plotRef.current) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(260, Math.round(entry.contentRect.width)));
    });
    observer.observe(plotRef.current);
    return () => observer.disconnect();
  }, [points.length]);

  useEffect(() => {
    const values = JSON.parse(signature) as number[];
    const target = { values, ceiling: hourlyCeiling(values) };
    const from = current.current;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let start: number | undefined;
    const update = (next: typeof target) => {
      current.current = next;
      setPlot(next);
    };
    const finish = () => {
      cancelAnimationFrame(frame);
      update(target);
    };
    const canAnimate = () =>
      animated &&
      !privateMode &&
      !media.matches &&
      !document.hidden &&
      document.documentElement.dataset.tmxMotion !== 'off';
    const tick = (time: number) => {
      if (!canAnimate()) return finish();
      start ??= time;
      const progress = Math.min(1, (time - start) / 950);
      update({
        values: values.map((value, index) =>
          interpolateCount(from.values[index] ?? value, value, progress),
        ),
        ceiling: interpolateCount(from.ceiling, target.ceiling, progress),
      });
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    const preference = () => {
      if (!canAnimate()) finish();
    };
    if (!canAnimate() || from.values.length !== values.length) finish();
    else frame = requestAnimationFrame(tick);
    media.addEventListener('change', preference);
    document.addEventListener('visibilitychange', preference);
    const observer = new MutationObserver(preference);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-tmx-motion'],
    });
    return () => {
      cancelAnimationFrame(frame);
      media.removeEventListener('change', preference);
      document.removeEventListener('visibilitychange', preference);
      observer.disconnect();
    };
  }, [signature, animated, privateMode]);

  const height = width < 400 ? 245 : 285;
  const chart = hourlyGeometry(plot.values, width, height, plot.ceiling);
  const focus = active === null ? undefined : chart.points[active];
  const peak = chart.points.reduce<(typeof chart.points)[number] | undefined>(
    (best, point) => (!best || point.value > best.value ? point : best),
    undefined,
  );
  const money = (value: number) =>
    pending ? '—' : privateMode ? '••••' : formatCurrency(value, currency);
  const step = Math.max(1, Math.ceil(Math.max(1, points.length - 1) / (width < 400 ? 4 : 8)));
  return (
    <section className={`glass-card ${styles.chart}`} data-revenue-chart data-animated={animated}>
      <header className={styles.header}>
        <h4>{title}</h4>
        <p>{description}</p>
        {controls}
      </header>
      {points.length === 0 ? (
        <p className={styles.empty}>{emptyMessage}</p>
      ) : (
        <>
          <div className={styles.summary}>
            <span>Total no período</span>
            <strong>{money(plot.values.reduce((sum, value) => sum + value, 0))}</strong>
            <span>
              {pending ? '—' : formatInt(points.reduce((sum, point) => sum + point.secondary, 0))}{' '}
              vendas
            </span>
          </div>
          <div
            ref={plotRef}
            style={{ visibility: pending ? 'hidden' : undefined }}
            aria-hidden={pending || undefined}
            className={styles.plot}
            onPointerLeave={() => setActive(null)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) setActive(null);
            }}
          >
            <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
              <defs>
                <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="currentColor" stopOpacity=".23" />
                  <stop offset="1" stopColor="currentColor" stopOpacity=".01" />
                </linearGradient>
              </defs>
              {[0, 1, 2, 3, 4].map((index) => (
                <path
                  key={index}
                  d={`M64 ${30 + ((height - 68) * index) / 4}H${width - 18}`}
                  className={styles.grid}
                />
              ))}
              <path d={chart.area} fill={`url(#${id})`} />
              <path d={chart.line} className={styles.line} />
              {chart.points.map((point) => (
                <circle
                  key={point.hour}
                  cx={point.x}
                  cy={point.y}
                  r={point.hour === active ? 5 : 2.5}
                  className={styles.dot}
                />
              ))}
              {chart.points
                .filter((point) => point.hour % step === 0 || point.hour === points.length - 1)
                .map((point) => (
                  <text key={point.hour} x={point.x} y={height - 13} textAnchor="middle">
                    {points[point.hour]?.label}
                  </text>
                ))}
              {peak && peak.value > 0 && (
                <text x={Math.min(width - 90, peak.x + 10)} y={Math.max(16, peak.y - 12)}>
                  Pico · {points[peak.hour]?.label}
                </text>
              )}
              {focus && <path d={`M${focus.x} 30V${height - 38}`} className={styles.guide} />}
            </svg>
            <div className={styles.yAxis} aria-hidden="true">
              {[0, 1, 2, 3, 4].map((index) => (
                <span
                  key={index}
                  style={{ top: `${((30 + ((height - 68) * index) / 4) / height) * 100}%` }}
                >
                  {privateMode ? '••••' : formatRevenueTick(plot.ceiling * (1 - index / 4))}
                </span>
              ))}
            </div>
            <div aria-label={`${title}: explore os pontos do gráfico`}>
              {chart.points.map((point) => (
                <button
                  type="button"
                  tabIndex={0}
                  key={points[point.hour]?.key ?? point.hour}
                  ref={(element) => {
                    targets.current[point.hour] = element;
                  }}
                  className={styles.hit}
                  style={{
                    left: `${(Math.max(64, point.x - (width - 82) / Math.max(1, points.length - 1) / 2) / width) * 100}%`,
                    top: `${(30 / height) * 100}%`,
                    width: `${((width - 82) / Math.max(1, points.length - 1) / width) * 100}%`,
                    height: `${((height - 68) / height) * 100}%`,
                  }}
                  aria-label={`${points[point.hour]?.label}: ${money(point.value)}, ${formatInt(points[point.hour]?.secondary ?? 0)} vendas`}
                  aria-pressed={active === point.hour}
                  onPointerEnter={() => setActive(point.hour)}
                  onFocus={() => setActive(point.hour)}
                  onClick={() => setActive(point.hour)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setActive(null);
                    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
                      event.preventDefault();
                      targets.current[
                        (point.hour + (event.key === 'ArrowRight' ? 1 : points.length - 1)) %
                          points.length
                      ]?.focus();
                    }
                  }}
                />
              ))}
            </div>
            {focus && (
              <output
                className={styles.tooltip}
                style={{
                  left: `clamp(0px, calc(${(focus.x / width) * 100}% - 56px), calc(100% - 112px))`,
                  top: `max(0px, calc(${(focus.y / height) * 100}% - 65px))`,
                }}
              >
                {points[focus.hour]?.label}
                <strong>{money(focus.value)}</strong>
              </output>
            )}
          </div>
          <p className={styles.caption}>
            Receita ({currency}) · Passe o mouse, toque ou use Tab nos horários.
          </p>
          <table className="sr-only" aria-hidden={pending || undefined}>
            <caption>{title}</caption>
            <thead>
              <tr>
                <th>Horário</th>
                <th>Receita</th>
                <th>Vendas</th>
              </tr>
            </thead>
            <tbody>
              {points.map((point) => (
                <tr key={point.key}>
                  <td>{point.label}</td>
                  <td>{money(point.value)}</td>
                  <td>{point.secondary}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
