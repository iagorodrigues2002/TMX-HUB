'use client';

import { Loader2 } from 'lucide-react';
import type { CloneStatus } from '@page-cloner/shared';

const STATUS_LABELS: Record<CloneStatus, string> = {
  queued: 'Na fila',
  rendering: 'Renderizando',
  sanitizing: 'Sanitizando',
  resolving_assets: 'Baixando assets',
  ready: 'Pronto',
  failed: 'Falhou',
};

interface StatusPillProps {
  status: CloneStatus | undefined;
  progress?: number;
}

/**
 * HUD-style status pill.
 *  - "Pronto" → cyan accent gradient (success)
 *  - "Falhou" → rose surface
 *  - in-flight → glass surface w/ animated cyan dot
 */
export function StatusPill({ status, progress }: StatusPillProps) {
  if (!status) {
    return (
      <span className="inline-flex items-center gap-2 rounded-sm border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/55">
        <Loader2 className="h-3 w-3 animate-spin" />
        Carregando
      </span>
    );
  }

  const label = STATUS_LABELS[status];

  if (status === 'ready') {
    return (
      <span
        className="inline-flex items-center gap-2 rounded-sm px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#031516] shadow-[0_0_12px_rgba(34,211,238,0.25)]"
        style={{ backgroundImage: 'linear-gradient(90deg, #0E7C86 0%, #22D3EE 100%)' }}
      >
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[#031516]" />
        {label}
      </span>
    );
  }

  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-2 rounded-sm border border-rose-400/40 bg-rose-500/15 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-rose-200">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-rose-300" />
        {label}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-2 rounded-sm border border-cyan-300/25 bg-cyan-300/[0.06] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-100">
      <span aria-hidden className="status-dot status-dot-cyan" />
      {label}
      {typeof progress === 'number' && progress > 0 && (
        <span className="text-cyan-200/70">{progress}%</span>
      )}
    </span>
  );
}
