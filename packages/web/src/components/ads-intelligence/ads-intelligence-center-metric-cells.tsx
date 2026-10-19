'use client';

import type { AdsIntelligenceMetrics } from '@/lib/api-client';
import { columns, money, numeric } from './ads-intelligence-center-support';
import { metricPresentation } from './metric-presentation';

export function MetricCells({
  metrics,
  privateMode,
}: { metrics: AdsIntelligenceMetrics; privateMode: boolean }) {
  return (
    <>
      {columns.map(({ key, kind }) => {
        const value = metrics[key];
        const financial = kind === 'money' || key === 'roas' || key === 'roi';
        const presentation = metricPresentation(key, value, privateMode && financial);
        const calculated = key === 'roas' || key === 'roi';
        const provisional =
          calculated &&
          !privateMode &&
          value != null &&
          metrics.calculation_status === 'provisional';
        const description =
          !privateMode && calculated && metrics.calculation_reason
            ? `${presentation.description} ${metrics.calculation_reason}`
            : presentation.description;
        const label =
          privateMode && financial
            ? '****'
            : value == null
              ? '—'
              : kind === 'money'
                ? money.format(value)
                : `${numeric.format(value)}${kind === 'percent' ? '%' : kind === 'ratio' ? '×' : ''}`;
        return (
          <td
            key={key}
            title={description || undefined}
            className={`whitespace-nowrap px-3 py-3 text-right tabular-nums ${presentation.tone} ${calculated ? 'font-semibold' : ''}`}
          >
            <span aria-hidden="true" className="mr-1 text-[10px]">
              {presentation.cue}
            </span>
            {label}
            {presentation.cue && <span className="sr-only"> — {description}</span>}
            {provisional && (
              <span className="mt-1 block text-[10px] font-normal text-muted-foreground">
                Parcial
              </span>
            )}
          </td>
        );
      })}
    </>
  );
}
