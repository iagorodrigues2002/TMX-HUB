'use client';

import { cn } from '@/lib/utils';
import * as React from 'react';

/**
 * Native checkbox styled to TMX.HUB:
 *  - dark glass surface
 *  - cyan check + glow when checked (paint via globals.css `[data-tmx-checkbox]:checked` rule)
 */
const Checkbox = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      type="checkbox"
      ref={ref}
      data-tmx-checkbox=""
      className={cn(
        'relative h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-sm border border-input bg-muted',
        'transition-colors',
        'checked:border-primary checked:shadow-[0_0_8px_rgba(34,211,238,0.4)]',
        'focus:outline-none focus:ring-2 focus:ring-ring',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
