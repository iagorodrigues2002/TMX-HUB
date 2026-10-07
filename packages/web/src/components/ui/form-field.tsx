'use client';

import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { type ReactElement, cloneElement } from 'react';

interface FormControlProps {
  id?: string;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

interface FormFieldProps {
  id: string;
  label: string;
  help?: string;
  error?: string | null;
  success?: boolean;
  children: ReactElement<FormControlProps>;
  className?: string;
}

export function FormField({
  id,
  label,
  help,
  error,
  success = false,
  children,
  className,
}: FormFieldProps) {
  const isSuccessful = success && !error;
  const describedBy = error ? `${id}-error` : help ? `${id}-help` : undefined;
  const control = cloneElement(children, {
    id,
    'aria-invalid': Boolean(error),
    'aria-describedby': describedBy,
    className: cn(
      children.props.className,
      'transition-[border-color,box-shadow] duration-[180ms] focus:ring-2 focus:ring-primary/50',
      isSuccessful && 'pr-10',
    ),
  });

  return (
    <div
      className={cn('space-y-1.5', className)}
      data-field-state={error ? 'error' : isSuccessful ? 'success' : undefined}
    >
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        {control}
        {isSuccessful && (
          <output
            aria-label="Campo válido"
            className="tmx-field-success pointer-events-none absolute inset-y-0 right-3 flex items-center text-success"
          >
            <svg aria-hidden className="h-4 w-4" fill="none" viewBox="0 0 24 24">
              <title>Campo válido</title>
              <path
                className="tmx-check-path"
                d="M5 12.5 9.25 17 19 7"
                pathLength="1"
                stroke="currentColor"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
              />
            </svg>
          </output>
        )}
      </div>
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
    <p id={id} role="alert" className="tmx-field-error text-xs leading-5 text-danger">
      {children}
    </p>
  );
}
