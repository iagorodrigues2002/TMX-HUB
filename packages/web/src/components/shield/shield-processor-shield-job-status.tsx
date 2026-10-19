'use client';

import { Button } from '@/components/ui/button';
import { type ShieldJobView, apiClient } from '@/lib/api-client';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Download, Loader2, XCircle } from 'lucide-react';
import { formatBytes } from './shield-processor-support';

export function ShieldJobStatus({ jobId }: { jobId: string }) {
  const { data, refetch } = useQuery<ShieldJobView>({
    queryKey: ['shield-job', jobId],
    queryFn: () => apiClient.getShieldJob(jobId),
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      if (s === 'ready' || s === 'failed') return false;
      return 3000;
    },
    refetchOnWindowFocus: false,
  });

  if (!data) {
    return (
      <div className="glass-card flex items-center gap-3 p-4 text-[13px] text-white/55">
        <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
        Carregando job…
      </div>
    );
  }

  const status = data.status;
  const isWorking = status === 'queued' || status === 'processing' || status === 'verifying';

  const statusText = {
    queued: 'Na fila',
    processing: 'Processando (FFmpeg)',
    verifying: 'Verificando com AssemblyAI',
    ready: 'Concluído',
    failed: 'Falhou',
  }[status];

  return (
    <div
      className={`glass-card space-y-4 p-5 ${
        status === 'failed' ? 'border-rose-300/30' : status === 'ready' ? 'border-cyan-300/30' : ''
      }`}
    >
      <div className="flex items-baseline justify-between">
        <div className="space-y-1">
          <p className="hud-label flex items-center gap-2">
            {isWorking && <Loader2 className="h-3 w-3 animate-spin text-cyan-300" />}
            {status === 'ready' && <CheckCircle2 className="h-3 w-3 text-emerald-300" />}
            {status === 'failed' && <XCircle className="h-3 w-3 text-rose-300" />}
            {statusText}
          </p>
          <h3 className="text-[15px] font-semibold text-white">{data.input.filename}</h3>
          <p className="text-[11px] text-white/45">
            Nicho: {data.niche.name} · White: {data.white.label} · Vol: {data.white.volumeDb}dB
            {' · '}
            Compressão: {data.compression}
          </p>
        </div>
        <Button size="sm" variant="ghost" onClick={() => void refetch()} disabled={isWorking}>
          Atualizar
        </Button>
      </div>

      {status === 'failed' && data.error && (
        <div className="rounded-md border border-rose-300/30 bg-rose-300/[0.06] p-3 text-[12px] text-rose-100/85">
          {data.error}
        </div>
      )}

      {status === 'ready' && data.output && (
        <div className="space-y-3 rounded-md border border-cyan-300/20 bg-cyan-300/[0.04] p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[13px] font-semibold text-white">
                {data.output.filename}
              </p>
              <p className="text-[11px] text-white/55">
                {formatBytes(data.output.bytes)}
                {data.input.bytes > 0 && (
                  <> · {Math.round((data.output.bytes / data.input.bytes) * 100)}% do original</>
                )}
              </p>
            </div>
            <Button asChild disabled={!data.output.downloadUrl}>
              <a
                href={data.output.downloadUrl ?? '#'}
                download={data.output.filename}
                target="_blank"
                rel="noreferrer"
              >
                <Download className="h-4 w-4" />
                Baixar
              </a>
            </Button>
          </div>
        </div>
      )}

      {data.transcriptStatus && (
        <div className="space-y-2">
          <p className="hud-label">Verificação AssemblyAI</p>
          <p className="text-[11px] text-white/55">
            Status:{' '}
            <span
              className={
                data.transcriptStatus === 'done'
                  ? 'text-emerald-300'
                  : data.transcriptStatus === 'failed'
                    ? 'text-rose-300'
                    : 'text-amber-300'
              }
            >
              {data.transcriptStatus}
            </span>
          </p>
          {data.transcriptStatus === 'failed' && data.transcriptError && (
            <pre className="max-h-[160px] overflow-auto whitespace-pre-wrap rounded-md border border-rose-300/30 bg-rose-300/[0.06] p-3 text-[12px] text-rose-100/85">
              {data.transcriptError}
            </pre>
          )}
          {data.transcriptStatus === 'skipped' && (
            <p className="text-[11px] text-white/45">
              ASSEMBLYAI_API_KEY não está configurada no servidor — verificação ignorada.
            </p>
          )}
          {data.transcript !== undefined && (
            <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap rounded-md border border-white/[0.08] bg-black/30 p-3 text-[12px] text-white/75">
              {data.transcript || '(transcript vazio — ótimo sinal!)'}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
