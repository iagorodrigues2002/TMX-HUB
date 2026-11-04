'use client';

export function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="min-w-0 break-words rounded-lg border border-border bg-muted p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="mono-num mt-1 text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}
