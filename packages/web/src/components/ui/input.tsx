'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-md border border-white/[0.10] bg-white/[0.04] px-4 text-[14px] text-white shadow-none transition-all',
          'placeholder:text-[11px] placeholder:font-semibold placeholder:uppercase placeholder:tracking-[0.12em] placeholder:text-white/40',
          'focus-visible:outline-none focus-visible:border-cyan-300/40 focus-visible:ring-2 focus-visible:ring-cyan-400/15',
          'disabled:cursor-not-allowed disabled:opacity-60',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = 'Input';

export { Input };
