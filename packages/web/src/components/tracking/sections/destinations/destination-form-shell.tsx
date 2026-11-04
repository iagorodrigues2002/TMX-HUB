import { cn } from '@/lib/utils';
import type { FormEventHandler, ReactNode } from 'react';

interface DestinationFormShellProps {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  notice?: ReactNode;
  onSubmit?: FormEventHandler<HTMLFormElement>;
  className?: string;
}

/** Shared settings surface. Provider-specific fields stay in the caller. */
export function DestinationFormShell({
  title,
  description,
  children,
  actions,
  notice,
  onSubmit,
  className,
}: DestinationFormShellProps) {
  return (
    <form
      className={cn('rounded-md border border-border bg-accent p-4', className)}
      onSubmit={onSubmit}
    >
      <div>
        <h3 className="text-sm font-medium text-foreground">{title}</h3>
        {description && (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{description}</p>
        )}
      </div>
      {notice && <div className="mt-3">{notice}</div>}
      <div className="mt-4">{children}</div>
      {actions && <div className="mt-4 flex flex-wrap items-center gap-2">{actions}</div>}
    </form>
  );
}
