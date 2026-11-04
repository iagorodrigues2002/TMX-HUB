import { cn } from '@/lib/utils';
import type { ReactNode } from 'react';

interface DestinationShellProps {
  title: string;
  description: string;
  count?: number;
  countLabel?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
  compact?: boolean;
}

/** Shared visual frame for every event destination. */
export function DestinationShell({
  title,
  description,
  count,
  countLabel = 'destinos',
  actions,
  children,
  className,
  contentClassName,
  compact = false,
}: DestinationShellProps) {
  return (
    <section
      className={cn(
        'rounded-lg border border-border bg-muted',
        compact ? 'p-5' : 'p-5 md:p-6',
        className,
      )}
    >
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {!compact && <p className="hud-label">Rastreamento avançado</p>}
          <div className={cn('flex flex-wrap items-center gap-2', !compact && 'mt-2')}>
            <h2 className={cn('font-semibold text-foreground', compact ? 'text-base' : 'text-2xl')}>
              {title}
            </h2>
            {typeof count === 'number' && (
              <span className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                {count} {count === 1 ? countLabel.replace(/s$/, '') : countLabel}
              </span>
            )}
          </div>
          <p
            className={cn(
              'max-w-3xl text-muted-foreground',
              compact ? 'mt-1 text-sm' : 'mt-2 text-sm leading-6',
            )}
          >
            {description}
          </p>
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      <div className={cn(compact ? 'mt-3' : 'mt-6', contentClassName)}>{children}</div>
    </section>
  );
}

/**
 * Normalizes the two older destination clients without changing their query/mutation lifecycle.
 * The direct-child selector removes their redundant section box; the remaining surfaces mirror
 * the restrained border and background treatment used by Meta.
 */
export const destinationLegacyContentClassName = cn(
  '[&>section]:space-y-4',
  '[&>section>div:first-child]:rounded-md',
  '[&>section>div:first-child]:border-border',
  '[&>section>div:first-child]:bg-accent',
  '[&>section>div:first-child]:text-muted-foreground',
  '[&_article]:rounded-md [&_article]:border-border [&_article]:bg-accent',
  '[&_form]:rounded-md [&_form]:border-border [&_form]:bg-accent',
);
