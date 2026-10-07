'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

type DataStateVariant = 'loading' | 'error' | 'empty';

interface DataStateProps {
  variant: DataStateVariant;
  title: string;
  description?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  action?: ReactNode;
  className?: string;
}

export function DataState({
  variant,
  title,
  description,
  onRetry,
  isRetrying = false,
  action,
  className,
}: DataStateProps) {
  const Icon = variant === 'loading' ? Loader2 : variant === 'error' ? AlertCircle : Inbox;

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={cn(
        'glass-card flex min-h-32 flex-col items-center justify-center gap-3 p-6 text-center',
        className,
      )}
    >
      <Icon
        aria-hidden
        className={cn(
          'h-5 w-5',
          variant === 'loading' && 'animate-spin text-primary',
          variant === 'error' && 'text-danger',
          variant === 'empty' && 'text-white/45',
        )}
      />
      <div className="max-w-lg space-y-1">
        <p className="text-sm font-semibold text-white">{title}</p>
        {description && <p className="text-sm leading-6 text-white/55">{description}</p>}
      </div>
      {onRetry && (
        <Button type="button" variant="outline" size="sm" disabled={isRetrying} onClick={onRetry}>
          <RefreshCw className={cn('h-4 w-4', isRetrying && 'animate-spin')} />
          {isRetrying ? 'Tentando novamente…' : 'Tentar novamente'}
        </Button>
      )}
      {action}
    </div>
  );
}
