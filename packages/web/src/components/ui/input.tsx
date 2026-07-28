'use client';

import { cn } from '@/lib/utils';
import * as React from 'react';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-lg border border-cyan-100/[0.14] bg-[#091a24]/80 px-4 text-[14px] text-white shadow-inner shadow-black/10 transition-all',
          'placeholder:text-[13px] placeholder:font-normal placeholder:tracking-normal placeholder:text-white/45',
          'hover:border-cyan-100/25 focus-visible:outline-none focus-visible:border-cyan-300/55 focus-visible:ring-2 focus-visible:ring-cyan-400/20',
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
