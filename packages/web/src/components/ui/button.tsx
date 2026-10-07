'use client';

import { cn } from '@/lib/utils';
import { Slot } from '@radix-ui/react-slot';
import { type VariantProps, cva } from 'class-variance-authority';
import { Check, Loader2 } from 'lucide-react';
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
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-0',
    'disabled:pointer-events-none disabled:opacity-50',
    '[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'border border-primary/20 text-accent-on shadow-[0_0_12px_rgba(34,211,238,0.25),inset_0_1px_0_rgba(255,255,255,.28)]',
          'hover:brightness-110 hover:shadow-[0_0_24px_rgba(34,211,238,0.42)]',
        ].join(' '),
        secondary:
          'border border-border bg-secondary text-secondary-foreground hover:border-primary/25 hover:bg-secondary/80',
        outline:
          'border border-border bg-bg-elevated/65 text-foreground shadow-[inset_0_1px_0_rgba(255,255,255,.025)] hover:border-primary/45 hover:bg-accent hover:shadow-[0_0_18px_rgba(34,211,238,.08)]',
        ghost:
          'text-muted-foreground hover:bg-accent hover:text-accent-foreground normal-case tracking-normal',
        destructive:
          'bg-danger/90 text-destructive-foreground hover:bg-danger shadow-[0_0_12px_rgba(244,63,94,0.25)]',
        link: 'text-primary underline-offset-4 hover:underline normal-case tracking-normal',
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
  loading?: boolean;
  loadingLabel?: string;
  success?: boolean;
  successLabel?: string;
  successDuration?: number;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant,
      size,
      asChild = false,
      style,
      disabled,
      loading = false,
      loadingLabel = 'Carregando…',
      success = false,
      successLabel = 'Concluído',
      successDuration = 1200,
      ...props
    },
    ref,
  ) => {
    const [showSuccess, setShowSuccess] = React.useState(false);

    React.useEffect(() => {
      if (!success) return;

      setShowSuccess(true);
      const timeout = window.setTimeout(() => setShowSuccess(false), successDuration);
      return () => window.clearTimeout(timeout);
    }, [success, successDuration]);

    const Comp = asChild ? Slot : 'button';
    const isDefault = !variant || variant === 'default';
    const mergedStyle = isDefault
      ? {
          backgroundImage: 'linear-gradient(90deg, var(--accent-from) 0%, var(--accent-to) 100%)',
          ...style,
        }
      : style;
    return (
      <Comp
        aria-busy={!asChild && loading ? true : undefined}
        className={cn(
          buttonVariants({ variant, size, className }),
          !asChild && showSuccess && 'tmx-button-success',
        )}
        data-feedback={!asChild && showSuccess ? 'success' : loading ? 'loading' : undefined}
        disabled={!asChild ? disabled || loading || showSuccess : disabled}
        style={mergedStyle}
        ref={ref}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <span
            aria-live="polite"
            className="tmx-button-content inline-flex items-center justify-center gap-2"
            key={showSuccess ? 'success' : loading ? 'loading' : 'idle'}
          >
            {showSuccess ? (
              <>
                <Check aria-hidden className="tmx-check-icon" />
                <span>{successLabel}</span>
              </>
            ) : loading ? (
              <>
                <Loader2 aria-hidden className="animate-spin" />
                <span>{loadingLabel}</span>
              </>
            ) : (
              children
            )}
          </span>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
