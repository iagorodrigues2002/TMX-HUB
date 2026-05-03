'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

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
        'relative h-4 w-4 shrink-0 cursor-pointer appearance-none rounded-sm border border-white/[0.18] bg-white/[0.04]',
        'transition-colors',
        'checked:border-cyan-300/60 checked:shadow-[0_0_8px_rgba(34,211,238,0.4)]',
        'focus:outline-none focus:ring-2 focus:ring-cyan-400/40',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  ),
);
Checkbox.displayName = 'Checkbox';

export { Checkbox };
