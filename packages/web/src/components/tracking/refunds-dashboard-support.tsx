'use client';

import { type ReactElement, cloneElement, useId } from 'react';
import './refunds-dashboard.css';

export const TZ = 'America/Sao_Paulo';

export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function ago(days: number) {
  const [y, m, d] = today().split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, d! - days, 12)).toISOString().slice(0, 10);
}

export const panel = 'refund-panel rounded-2xl border border-white/10 bg-bg-elevated/70 p-5 sm:p-6';

export const select =
  'h-11 w-full rounded-lg border border-cyan-100/20 bg-bg-elevated px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cyan-300';

export function Field({
  label,
  children,
}: { label: string; children: ReactElement<{ id?: string }> }) {
  const id = useId();
  return (
    <label htmlFor={id} className="block min-w-0 space-y-2 text-xs text-slate-300">
      <span>{label}</span>
      {cloneElement(children, { id })}
    </label>
  );
}

export function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div>
      <dt className="text-sm text-white/60">{label}</dt>
      <dd className="mt-2 text-2xl font-semibold tabular-nums text-white">{value}</dd>
      <p className="mt-1 text-xs leading-5 text-white/50">{detail}</p>
    </div>
  );
}

export function Empty() {
  return (
    <p className="py-8 text-center text-sm text-white/50">Nenhum dado disponível neste filtro.</p>
  );
}
