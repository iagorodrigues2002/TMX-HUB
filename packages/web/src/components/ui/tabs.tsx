'use client';

import { cn } from '@/lib/utils';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      'tmx-tabs-list flex min-h-13 w-full max-w-full grid-flow-col items-center justify-start gap-1 overflow-x-auto overscroll-x-contain rounded-lg border border-border bg-bg-elevated p-1 text-muted-foreground sm:inline-grid sm:h-11 sm:min-h-0 sm:justify-stretch',
      className,
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    data-tabs-active-gradient=""
    className={cn(
      'inline-flex items-center justify-center whitespace-nowrap rounded-md px-4 font-semibold transition-[background-color,color,box-shadow] duration-[160ms]',
      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      'disabled:pointer-events-none disabled:opacity-50',
      'text-muted-foreground hover:bg-muted hover:text-foreground data-[state=active]:text-accent-on',
      'data-[state=active]:shadow-[0_1px_6px_rgba(34,211,238,0.16)]',
      'h-11 shrink-0 text-[13px] tracking-[0.01em] sm:h-9',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    data-motion-screen={`tab:${props.value}`}
    className={cn(
      'tmx-tabs-content mt-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
