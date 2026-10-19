'use client';

export function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 break-words rounded-lg border border-white/[0.07] bg-white/[0.025] p-3">
      <p className="text-[10px] uppercase tracking-wider text-white/35">{label}</p>
      <p className="mono-num mt-1 text-base font-semibold text-white/85">{value}</p>
    </div>
  );
}
