import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  [
    'inline-flex items-center gap-1.5 rounded-sm border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]',
    'transition-colors',
  ].join(' '),
  {
    variants: {
      variant: {
        default:
          'border-cyan-300/30 bg-cyan-300/10 text-cyan-100',
        secondary: 'border-white/10 bg-white/[0.06] text-white/65',
        destructive: 'border-rose-400/40 bg-rose-500/15 text-rose-200',
        success: 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100',
        warning: 'border-amber-300/30 bg-amber-400/10 text-amber-100',
        outline: 'border-white/15 bg-transparent text-white/70',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
