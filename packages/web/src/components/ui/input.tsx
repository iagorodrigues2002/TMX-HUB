'use client';

import { cn } from '@/lib/utils';
import * as React from 'react';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-11 w-full rounded-lg border border-input bg-bg-elevated/85 px-4 text-[14px] text-foreground shadow-[inset_0_1px_10px_rgba(0,0,0,.12)] transition-[border-color,box-shadow,background-color]',
          'placeholder:text-[13px] placeholder:font-normal placeholder:tracking-normal placeholder:text-muted-foreground',
          'hover:border-primary/35 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:shadow-[inset_0_1px_10px_rgba(0,0,0,.1),0_0_20px_rgba(34,211,238,.08)]',
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
