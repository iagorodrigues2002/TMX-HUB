'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AlertCircle, Inbox, Loader2, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';

type DataStateVariant = 'loading' | 'error' | 'empty';

export interface DataStateTechnicalDetails {
  statusCode?: number;
  requestId?: string | null;
}

interface DataStateProps {
  variant: DataStateVariant;
  title: string;
  description?: string;
  suggestion?: string;
  onRetry?: () => void;
  isRetrying?: boolean;
  technicalDetails?: DataStateTechnicalDetails;
  action?: ReactNode;
  className?: string;
}

interface ErrorStateCopy {
  title: string;
  description: string;
  suggestion: string;
}

interface ErrorStateOptions {
  title?: string;
  suggestion?: string;
}

const ERROR_COPY_BY_STATUS: Record<number, ErrorStateCopy> = {
  400: {
    title: 'Dados inválidos',
    description: 'A requisição foi recusada. Verifique os campos.',
    suggestion: 'Revise os dados informados e tente novamente.',
  },
  401: {
    title: 'Sem acesso',
    description: 'Sua sessão expirou. Faça login novamente.',
    suggestion: 'Entre novamente para continuar.',
  },
  403: {
    title: 'Permissão negada',
    description: 'Você não tem permissão pra esta ação.',
    suggestion: 'Peça acesso ao administrador da conta.',
  },
  404: {
    title: 'Não encontrado',
    description: 'O recurso solicitado não existe mais.',
    suggestion: 'Atualize a página ou volte para a tela anterior.',
  },
  500: {
    title: 'Erro no servidor',
    description: 'Algo deu errado do nosso lado. Tente novamente.',
    suggestion: 'Aguarde alguns segundos e tente novamente.',
  },
  503: {
    title: 'Serviço indisponível',
    description: 'Está fora do ar. Aguarde e tente de novo.',
    suggestion: 'Tente novamente em alguns minutos.',
  },
};

const DEFAULT_ERROR_COPY: ErrorStateCopy = {
  title: 'Não foi possível concluir a ação',
  description: 'O servidor não conseguiu processar a solicitação.',
  suggestion: 'Tente novamente. Se o erro persistir, contate o suporte.',
};

const CONNECTION_ERROR_COPY: ErrorStateCopy = {
  title: 'Falha de conexão',
  description: 'Não foi possível se comunicar com o servidor.',
  suggestion: 'Verifique sua conexão e tente novamente.',
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function errorMetadata(error: unknown): DataStateTechnicalDetails {
  const value = asRecord(error);
  const problem = asRecord(value?.problem);
  const errorMessage = error instanceof Error ? error.message : '';
  const parsedStatus = errorMessage.match(/\bHTTP\s+(\d{3})\b/i)?.[1];
  const statusCandidate = value?.status ?? problem?.status ?? parsedStatus;
  const statusCode = Number(statusCandidate);
  const requestIdCandidate =
    value?.request_id ?? value?.requestId ?? problem?.request_id ?? problem?.requestId;

  return {
    statusCode: Number.isInteger(statusCode) && statusCode >= 100 ? statusCode : undefined,
    requestId: typeof requestIdCandidate === 'string' ? requestIdCandidate : undefined,
  };
}

/** Converts API failures into user-facing copy while keeping diagnostics optional. */
export function getErrorDataStateProps(error: unknown, options: ErrorStateOptions = {}) {
  const technicalDetails = errorMetadata(error);
  const statusCode = technicalDetails.statusCode;
  const copy =
    statusCode === undefined || statusCode === 0
      ? CONNECTION_ERROR_COPY
      : (ERROR_COPY_BY_STATUS[statusCode] ?? DEFAULT_ERROR_COPY);
  const description =
    options.title && statusCode
      ? `${copy.title} (HTTP ${statusCode}). ${copy.description}`
      : copy.description;

  return {
    title: options.title ?? copy.title,
    description,
    suggestion: options.suggestion ?? copy.suggestion,
    technicalDetails,
  };
}

export function DataState({
  variant,
  title,
  description,
  suggestion,
  onRetry,
  isRetrying = false,
  technicalDetails,
  action,
  className,
}: DataStateProps) {
  const Icon = variant === 'loading' ? Loader2 : variant === 'error' ? AlertCircle : Inbox;
  const hasTechnicalDetails = Boolean(technicalDetails?.statusCode || technicalDetails?.requestId);

  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      aria-live="polite"
      className={cn(
        'glass-card flex min-h-32 flex-col items-center justify-center gap-3 p-6 text-center',
        variant === 'loading' && 'tmx-data-state-loading',
        variant === 'error' && 'tmx-data-state-error',
        variant !== 'loading' && 'tmx-data-state-content',
        className,
      )}
      data-variant={variant}
    >
      <Icon
        aria-hidden
        className={cn(
          'h-5 w-5',
          variant === 'loading' && 'animate-spin text-primary',
          variant === 'error' && 'tmx-error-icon text-danger',
          variant === 'empty' && 'text-white/45',
        )}
      />
      <div className={cn('max-w-lg space-y-1', variant === 'error' && 'tmx-error-message')}>
        <p className="text-sm font-semibold text-white">{title}</p>
        {description && <p className="text-sm leading-6 text-white/55">{description}</p>}
        {suggestion && (
          <p className="pt-1 text-sm leading-6 text-white/70">
            <span className="font-medium text-white/85">Próximo passo:</span> {suggestion}
          </p>
        )}
      </div>
      {onRetry && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          disabled={isRetrying}
          loading={isRetrying}
          loadingLabel="Tentando novamente…"
          onClick={onRetry}
        >
          <RefreshCw className="h-4 w-4" />
          Tentar novamente
        </Button>
      )}
      {action}
      {variant === 'error' && hasTechnicalDetails && (
        <details className="max-w-lg text-left text-xs text-white/45">
          <summary className="cursor-pointer rounded-sm px-1 py-1.5 outline-none transition-colors hover:text-white/65 focus-visible:ring-2 focus-visible:ring-primary">
            Detalhes técnicos
          </summary>
          <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-white/[0.08] bg-black/15 px-3 py-2">
            {technicalDetails?.statusCode && (
              <>
                <dt>Status</dt>
                <dd className="font-mono text-white/65">HTTP {technicalDetails.statusCode}</dd>
              </>
            )}
            {technicalDetails?.requestId && (
              <>
                <dt>Request ID</dt>
                <dd className="break-all font-mono text-white/65">{technicalDetails.requestId}</dd>
              </>
            )}
          </dl>
        </details>
      )}
    </div>
  );
}
