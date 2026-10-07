'use client';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { type ReactElement, cloneElement } from 'react';

interface FormControlProps {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

interface FormFieldProps {
  id: string;
  label: string;
  help?: string;
  error?: string | null;
  children: ReactElement<FormControlProps>;
  className?: string;
}

export function FormField({ id, label, help, error, children, className }: FormFieldProps) {
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined;
  const control = cloneElement(children, {
    id,
    'aria-invalid': Boolean(error),
    'aria-describedby': describedBy,
  });

  return (
    <div className={cn('space-y-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {control}
      {error ? (
        <FieldError id={`${id}-error`}>{error}</FieldError>
      ) : help ? (
        <p id={`${id}-help`} className="text-xs leading-5 text-white/45">
          {help}
        </p>
      ) : null}
    </div>
  );
}

export function FieldError({ id, children }: { id?: string; children: string }) {
  return (
    <p id={id} role="alert" className="text-xs leading-5 text-danger">
      {children}
    </p>
  );
}
