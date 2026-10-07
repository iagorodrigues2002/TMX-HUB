import { DataState } from '@/components/ui/data-state';
import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface DestinationListProps {
  children: ReactNode;
  isLoading?: boolean;
  error?: Error | null;
  empty?: boolean;
  loadingTitle: string;
  emptyTitle: string;
  emptyDescription?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  className?: string;
}

/** Consistent loading, error and empty states for destination collections. */
export function DestinationList({
  children,
  isLoading = false,
  error,
  empty = false,
  loadingTitle,
  emptyTitle,
  emptyDescription,
  onRetry,
  isRetrying,
  className,
}: DestinationListProps) {
  if (isLoading) {
    return <DataState className="min-h-48" variant="loading" title={loadingTitle} />;
  }

  if (error) {
    return (
      <DataState
        className="min-h-48"
        variant="error"
        title="Não foi possível carregar os destinos"
        description={error.message}
        onRetry={onRetry}
        isRetrying={isRetrying}
      />
    );
  }

  if (empty) {
    return (
      <div className="rounded border border-dashed border-white/[0.08] p-4">
        <p className="text-sm text-white/55">{emptyTitle}</p>
        {emptyDescription && (
          <p className="mt-1 text-xs leading-5 text-white/35">{emptyDescription}</p>
        )}
      </div>
    );
  }

  return <div className={cn('space-y-3', className)}>{children}</div>;
}
