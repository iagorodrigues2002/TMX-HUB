'use client';

import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Button styled to TMX.HUB / Maskai-derived design system.
 *
 * Variants:
 *   default    — accent gradient (turquoise) primary CTA.
 *   secondary  — muted glass surface.
 *   outline    — transparent w/ subtle white border.
 *   ghost      — transparent, hover only.
 *   destructive — danger pink.
 *   link       — inline cyan link.
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md',
    'font-semibold uppercase tracking-[0.04em] transition-all',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:ring-offset-0',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'text-[#031516] shadow-[0_0_12px_rgba(34,211,238,0.25)]',
          'hover:brightness-110 hover:shadow-[0_0_18px_rgba(34,211,238,0.4)]',
        ].join(' '),
        secondary:
          'bg-white/[0.06] text-white border border-white/[0.08] hover:bg-white/[0.10]',
        outline:
          'bg-transparent text-white border border-white/[0.12] hover:bg-white/[0.04] hover:border-cyan-300/40',
        ghost: 'text-white/70 hover:bg-white/[0.04] hover:text-white normal-case tracking-normal',
        destructive:
          'bg-rose-500/90 text-white hover:bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.25)]',
        link: 'text-cyan-300 underline-offset-4 hover:underline normal-case tracking-normal',
      },
      size: {
        default: 'h-10 px-4 text-[12px]',
        sm: 'h-8 rounded-md px-3 text-[11px]',
        lg: 'h-12 rounded-md px-6 text-[13px]',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    const isDefault = !variant || variant === 'default';
    const mergedStyle = isDefault
      ? {
          backgroundImage: 'linear-gradient(90deg, #0E7C86 0%, #22D3EE 100%)',
          ...style,
        }
      : style;
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        style={mergedStyle}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
