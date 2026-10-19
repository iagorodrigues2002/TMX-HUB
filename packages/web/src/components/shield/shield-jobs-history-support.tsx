'use client';

export const MAX_BULK = 100;

/** Cap total — ZIP vira blob na RAM do browser. Casa com cap server-side. */
export const MAX_BULK_BYTES = 3 * 1024 * 1024 * 1024;

// 3GB

export function formatBytes(b?: number): string {
  if (!b) return '—';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function FilterButton({
  value,
  current,
  onClick,
  count,
  label,
}: {
  value: 'all' | 'ready' | 'working' | 'failed';
  current: string;
  onClick: (v: 'all' | 'ready' | 'working' | 'failed') => void;
  count: number;
  label?: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
        active
          ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200'
          : 'border-white/[0.10] bg-white/[0.03] text-white/55 hover:bg-white/[0.06]'
      }`}
    >
      {label ?? (value === 'all' ? 'Todos' : value)} ({count})
    </button>
  );
}
