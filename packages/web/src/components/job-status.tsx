'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import type { CloneJob } from '@/lib/api-client';
import { Card, CardContent } from '@/components/ui/card';

interface JobStatusProps {
  job: CloneJob | undefined;
  isLoading: boolean;
  error: Error | null;
}

const STATUS_TEXT: Record<string, string> = {
  queued: 'Job na fila — aguardando worker…',
  rendering: 'Renderizando página no navegador headless…',
  sanitizing: 'Sanitizando HTML e removendo scripts…',
  resolving_assets: 'Baixando assets (imagens, CSS, fontes)…',
};

export function JobStatus({ job, isLoading, error }: JobStatusProps) {
  if (isLoading && !job) {
    return (
      <Card>
        <CardContent className="flex items-center gap-3 p-6 text-[13px] text-white/60">
          <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
          Carregando job…
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-rose-400/40 bg-rose-500/[0.06]">
        <CardContent className="flex items-start gap-3 p-6 text-[13px]">
          <AlertCircle className="mt-0.5 h-4 w-4 text-rose-300" />
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-200">
              Falha ao carregar job
            </p>
            <p className="text-white/60">{error.message}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!job) return null;

  if (job.status === 'failed' && job.error) {
    return (
      <Card className="border-rose-400/40 bg-rose-500/[0.06]">
        <CardContent className="flex items-start gap-3 p-6 text-[13px]">
          <AlertCircle className="mt-0.5 h-4 w-4 text-rose-300" />
          <div className="space-y-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-rose-200">
              Clone falhou
            </p>
            <p className="text-white/65">{job.error.message}</p>
            <p className="font-mono text-[11px] text-white/40">código: {job.error.code}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const text = STATUS_TEXT[job.status];
  if (!text) return null;

  return (
    <Card>
      <CardContent className="flex items-center gap-3 p-6 text-[13px]">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
        <div className="flex-1 space-y-2">
          <p className="text-white/75">{text}</p>
          {typeof job.progress === 'number' && (
            <div className="h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full transition-all"
                style={{
                  width: `${Math.min(100, Math.max(0, job.progress))}%`,
                  backgroundImage: 'linear-gradient(90deg, #0E7C86 0%, #22D3EE 100%)',
                }}
              />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
