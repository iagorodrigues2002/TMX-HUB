import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export type KpiTone = 'default' | 'positive' | 'spend' | 'warn';
export type KpiVariant = 'default' | 'compact' | 'financial' | 'status';

export interface KpiProps {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone?: KpiTone;
  variant?: KpiVariant;
  className?: string;
}

const toneStyles: Record<KpiTone, { surface: string; icon: string }> = {
  default: { surface: 'border-white/[0.06] bg-white/[0.02]', icon: 'text-cyan-300' },
  positive: {
    surface: 'border-emerald-300/30 bg-emerald-300/[0.04]',
    icon: 'text-emerald-300',
  },
  spend: { surface: 'border-amber-300/30 bg-amber-300/[0.03]', icon: 'text-amber-300' },
  warn: { surface: 'border-red-300/30 bg-red-300/[0.03]', icon: 'text-red-300' },
};

export function Kpi({
  label,
  value,
  hint,
  icon,
  tone = 'default',
  variant = 'default',
  className,
}: KpiProps) {
  const styles = toneStyles[tone];

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'tmx-kpi-card flex items-center gap-4 rounded-xl border p-4',
          styles.surface,
          className,
        )}
        data-tone={tone}
        data-variant={variant}
      >
        {icon && (
          <span
            className={cn(
              'grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.04]',
              styles.icon,
            )}
          >
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <p className="mono-num text-2xl font-semibold leading-tight text-white">{value}</p>
          <p className="mt-0.5 text-xs text-white/45">{label}</p>
          {hint && <p className="mt-1 text-[11px] text-white/40">{hint}</p>}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'tmx-kpi-card rounded-xl border p-4',
        styles.surface,
        variant === 'financial' && 'min-h-[128px]',
        variant === 'status' && 'border-dashed',
        className,
      )}
      data-tone={tone}
      data-variant={variant}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="hud-label">{label}</p>
        {icon && <span className={cn('shrink-0', styles.icon)}>{icon}</span>}
      </div>
      <p className="mono-num mt-3 min-w-0 break-words text-[clamp(1.25rem,3vw,1.75rem)] font-semibold leading-tight tracking-[-0.04em] text-white">
        {value}
      </p>
      {hint && <p className="mt-1 text-[11px] text-white/45">{hint}</p>}
    </div>
  );
}
