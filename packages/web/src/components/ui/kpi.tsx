'use client';

import { useCountUp } from '@/lib/hooks/use-count-up';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

export type KpiTone = 'default' | 'positive' | 'spend' | 'warn';
export type KpiVariant = 'default' | 'compact' | 'financial' | 'status';

export interface KpiProps {
  label: string;
  value: string;
  countUp?: {
    value: number;
    format: (value: number) => string;
    duration?: number;
  };
  hint?: string;
  icon?: ReactNode;
  tone?: KpiTone;
  variant?: KpiVariant;
  className?: string;
}

const toneStyles: Record<KpiTone, { surface: string; icon: string }> = {
  default: { surface: 'border-border bg-muted', icon: 'text-primary' },
  positive: {
    surface: 'border-success/30 bg-success/[0.04]',
    icon: 'text-success',
  },
  spend: { surface: 'border-warning/30 bg-warning/[0.03]', icon: 'text-warning' },
  warn: { surface: 'border-danger/30 bg-danger/[0.03]', icon: 'text-danger' },
};

const cardInteractionStyles =
  'group hover:shadow-[0_24px_64px_rgba(0,0,0,0.48),0_0_28px_rgba(34,211,238,0.1)] motion-reduce:hover:transform-none';

export function Kpi({
  label,
  value,
  countUp,
  hint,
  icon,
  tone = 'default',
  variant = 'default',
  className,
}: KpiProps) {
  const styles = toneStyles[tone];
  const animatedValue = useCountUp(countUp?.value, countUp?.duration);
  const displayValue =
    countUp && animatedValue !== undefined ? countUp.format(animatedValue) : value;

  const valueContent = countUp ? (
    <>
      <span className="sr-only">{value}</span>
      <span aria-hidden="true">{displayValue}</span>
    </>
  ) : (
    value
  );

  if (variant === 'compact') {
    return (
      <div
        className={cn(
          'tmx-kpi-card flex items-center gap-4 rounded-xl border p-4',
          cardInteractionStyles,
          styles.surface,
          className,
        )}
        data-tone={tone}
        data-variant={variant}
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-cyan-300/0 transition-colors duration-200 group-hover:bg-cyan-300/[0.035] motion-reduce:transition-none"
        />
        {icon && (
          <span
            className={cn(
              'relative z-[1] grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/[0.04]',
              styles.icon,
            )}
          >
            {icon}
          </span>
        )}
        <div className="relative z-[1] min-w-0">
          <p className="mono-num text-2xl font-semibold leading-tight text-white">{valueContent}</p>
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
        cardInteractionStyles,
        styles.surface,
        variant === 'financial' && 'min-h-[128px]',
        variant === 'status' && 'border-dashed',
        className,
      )}
      data-tone={tone}
      data-variant={variant}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-cyan-300/0 transition-colors duration-200 group-hover:bg-cyan-300/[0.035] motion-reduce:transition-none"
      />
      <div className="relative z-[1] flex items-center justify-between gap-3">
        <p className="hud-label">{label}</p>
        {icon && <span className={cn('shrink-0', styles.icon)}>{icon}</span>}
      </div>
      <p className="mono-num relative z-[1] mt-3 min-w-0 break-words text-[clamp(1.25rem,3vw,1.75rem)] font-semibold leading-tight tracking-[-0.04em] text-white">
        {valueContent}
      </p>
      {hint && <p className="relative z-[1] mt-1 text-[11px] text-white/45">{hint}</p>}
    </div>
  );
}
