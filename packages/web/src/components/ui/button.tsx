'use client';

import { cn } from '@/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';

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
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg',
    'font-semibold tracking-[0.01em] transition-all duration-200 active:scale-[0.98]',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 focus-visible:ring-offset-0',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'border border-cyan-200/20 text-[#031516] shadow-[0_0_12px_rgba(34,211,238,0.25),inset_0_1px_0_rgba(255,255,255,.28)]',
          'hover:brightness-110 hover:shadow-[0_0_24px_rgba(34,211,238,0.42)]',
        ].join(' '),
        secondary:
          'bg-cyan-100/[0.07] text-white border border-cyan-100/[0.12] hover:bg-cyan-100/[0.12] hover:border-cyan-100/20',
        outline:
          'bg-[#071720]/65 text-white border border-cyan-100/[0.16] shadow-[inset_0_1px_0_rgba(255,255,255,.025)] hover:bg-cyan-100/[0.07] hover:border-cyan-300/45 hover:shadow-[0_0_18px_rgba(34,211,238,.08)]',
        ghost: 'text-white/70 hover:bg-white/[0.04] hover:text-white normal-case tracking-normal',
        destructive:
          'bg-rose-500/90 text-white hover:bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.25)]',
        link: 'text-cyan-300 underline-offset-4 hover:underline normal-case tracking-normal',
      },
      size: {
        default: 'h-10 px-4 text-[13px]',
        sm: 'h-8 rounded-md px-3 text-[12px]',
        lg: 'h-12 rounded-xl px-6 text-[14px]',
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
