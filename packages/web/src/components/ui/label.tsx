'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * HUD-style label.
 * Default: uppercase, tracked-out, small.
 * Pass `data-plain` or your own className to override.
 */
const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => (
    <label
      ref={ref}
      className={cn(
        'text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55 leading-none',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    />
  ),
);
Label.displayName = 'Label';

export { Label };
