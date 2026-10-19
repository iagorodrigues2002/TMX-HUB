'use client';

import { cn } from '@/lib/utils';
import * as React from 'react';

/**
 * HUD-style label.
 * Default: uppercase, tracked-out, small.
 * Pass `data-plain` or your own className to override.
 */
const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, htmlFor, children, ...props }, ref) => (
    <label
      ref={ref}
      htmlFor={htmlFor}
      className={cn(
        'text-[11px] font-semibold uppercase tracking-[0.12em] text-white/55 leading-none',
        'peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        className,
      )}
      {...props}
    >
      {children}
    </label>
  ),
);
Label.displayName = 'Label';

export { Label };
