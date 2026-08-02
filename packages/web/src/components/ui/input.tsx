'use client';

import { cn } from '@/lib/utils';
import * as React from 'react';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-lg border border-cyan-100/[0.14] bg-[#06151e]/85 px-4 text-[14px] text-white shadow-[inset_0_1px_10px_rgba(0,0,0,.18),inset_0_1px_0_rgba(255,255,255,.02)] transition-all',
          'placeholder:text-[13px] placeholder:font-normal placeholder:tracking-normal placeholder:text-white/45',
          'hover:border-cyan-100/25 focus-visible:outline-none focus-visible:border-cyan-300/60 focus-visible:ring-2 focus-visible:ring-cyan-400/15 focus-visible:shadow-[inset_0_1px_10px_rgba(0,0,0,.15),0_0_20px_rgba(34,211,238,.08)]',
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
