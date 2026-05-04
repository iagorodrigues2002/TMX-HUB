'use client';

import type { StepResult } from '@/lib/upsell/calc';

interface Props {
  results: StepResult[];
}

/**
 * Stacked horizontal bars per upsell step. SVG-free, just divs + flex —
 * keeps the bundle small and renders identically in dark mode.
 */
export function ResultsChart({ results }: Props) {
  if (results.length === 0) return null;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-emerald-400" />
          Aceite
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-amber-400" />
          Rejeite
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-sm bg-red-400" />
          Não viu
        </span>
      </div>

      {results.map((r) => (
        <div key={r.name} className="space-y-1">
          <div className="flex items-baseline justify-between text-[12px] text-white/70">
            <span className="font-semibold uppercase tracking-[0.16em] text-white/85">
              {r.name}
            </span>
            <span className="font-mono text-white/45">
              {r.accepted} / {r.rejected} / {r.notSeen}
            </span>
          </div>
          <div className="flex h-6 w-full overflow-hidden rounded border border-white/[0.06] bg-black/30 text-[10px] font-semibold">
            {r.rates.accepted > 0 && (
              <div
                className="flex items-center justify-center bg-emerald-400/90 text-black"
                style={{ width: `${r.rates.accepted}%` }}
                title={`${r.accepted} aceitaram`}
              >
                {r.rates.accepted >= 8 ? `${r.rates.accepted}%` : ''}
              </div>
            )}
            {r.rates.rejected > 0 && (
              <div
                className="flex items-center justify-center bg-amber-400/90 text-black"
                style={{ width: `${r.rates.rejected}%` }}
                title={`${r.rejected} rejeitaram`}
              >
                {r.rates.rejected >= 8 ? `${r.rates.rejected}%` : ''}
              </div>
            )}
            {r.rates.notSeen > 0 && (
              <div
                className="flex items-center justify-center bg-red-400/85 text-black"
                style={{ width: `${r.rates.notSeen}%` }}
                title={`${r.notSeen} não viram`}
              >
                {r.rates.notSeen >= 8 ? `${r.rates.notSeen}%` : ''}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
