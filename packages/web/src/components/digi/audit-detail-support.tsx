'use client';

import type { DigiAuditStatusView, DigiAuditView, DigiItemStateView } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { CHECKLIST, itemKey } from './checklist-data';

export const STATUS_OPTIONS: Array<{ value: DigiAuditStatusView; label: string }> = [
  { value: 'draft', label: 'Rascunho' },
  { value: 'in_review', label: 'Em revisão' },
  { value: 'approved', label: 'Aprovado' },
  { value: 'rejected', label: 'Rejeitado' },
  { value: 'abandoned', label: 'Abandonado' },
];

export function progressOfSection(audit: DigiAuditView, sectionId: string) {
  const section = CHECKLIST.find((s) => s.id === sectionId);
  if (!section) return { done: 0, total: 0 };
  let done = 0;
  for (const item of section.items) {
    const state = audit.items[itemKey(sectionId, item.id)]?.state;
    if (state === 'done' || state === 'na') done++;
  }
  return { done, total: section.items.length };
}

export function StateToggle({
  current,
  onChange,
}: {
  current: DigiItemStateView;
  onChange: (s: DigiItemStateView) => void;
}) {
  const cycle = () => {
    const next: DigiItemStateView =
      current === 'pending' ? 'done' : current === 'done' ? 'na' : 'pending';
    onChange(next);
  };
  const cls =
    current === 'done'
      ? 'border-emerald-300/40 bg-emerald-300/15 text-emerald-200'
      : current === 'na'
        ? 'border-white/[0.15] bg-white/[0.04] text-white/45'
        : 'border-white/[0.18] bg-white/[0.04] text-white/65';
  const label = current === 'done' ? '✓' : current === 'na' ? '—' : ' ';
  return (
    <button
      type="button"
      onClick={cycle}
      title={`Estado: ${current}. Clique pra alternar.`}
      className={cn(
        'mt-0.5 grid h-5 w-5 shrink-0 cursor-pointer place-items-center rounded-sm border font-mono text-[11px] font-bold transition-colors',
        cls,
      )}
    >
      {label}
    </button>
  );
}

export function ProgressMini({
  label,
  done,
  total,
  tone,
}: {
  label: string;
  done: number;
  total: number;
  tone: 'cyan' | 'emerald' | 'amber';
}) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const barClass = {
    cyan: 'bg-cyan-300/70',
    emerald: 'bg-emerald-300/70',
    amber: 'bg-amber-300/70',
  }[tone];
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="hud-label">{label}</p>
        <span className="font-mono text-[12px] text-white/65">
          {done}/{total} <span className="text-white/35">· {pct}%</span>
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div className={`h-full ${barClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
