'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { apiClient } from '@/lib/api-client';
import { Download, Loader2, Package, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { MAX_BULK_BYTES, formatBytes } from './creative-studio-support';
import type { useCreativeStudioState } from './creative-studio-use-creative-studio-state';

export function renderRecentJobs({
  qc,
  selectedJobs,
  setSelectedJobs,
  isDownloading,
  downloadingJobId,
  jobs,
  readyJobs,
  selectedReadyJobs,
  selectedBytes,
  downloadSelected,
  downloadJob,
}: Pick<
  ReturnType<typeof useCreativeStudioState>,
  | 'qc'
  | 'selectedJobs'
  | 'setSelectedJobs'
  | 'isDownloading'
  | 'downloadingJobId'
  | 'jobs'
  | 'readyJobs'
  | 'selectedReadyJobs'
  | 'selectedBytes'
  | 'downloadSelected'
  | 'downloadJob'
>) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="hud-label">Histórico recente</p>
          <p className="mt-1 text-xs text-white/40">
            Selecione os resultados prontos para baixar tudo em um arquivo ZIP.
          </p>
        </div>
        {readyJobs.length > 0 && (
          <div className="flex items-center gap-2 text-xs text-white/60">
            <Checkbox
              checked={readyJobs.every((job) => selectedJobs.has(job.id))}
              onChange={(event) =>
                setSelectedJobs(
                  event.target.checked ? new Set(readyJobs.map((job) => job.id)) : new Set(),
                )
              }
            />
            Selecionar todos os prontos
          </div>
        )}
      </div>
      {selectedReadyJobs.length > 0 && (
        <div className="glass-card flex flex-wrap items-center justify-between gap-3 border-cyan-300/25 p-3">
          <p className="text-xs text-white/65">
            <strong className="text-cyan-200">{selectedReadyJobs.length}</strong> selecionado(s) ·{' '}
            {formatBytes(selectedBytes)}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedJobs(new Set())}>
              Limpar
            </Button>
            <Button
              size="sm"
              onClick={() => void downloadSelected()}
              disabled={isDownloading || selectedBytes > MAX_BULK_BYTES}
            >
              {isDownloading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Package className="mr-2 h-4 w-4" />
              )}
              {isDownloading ? 'Gerando ZIP…' : 'Baixar selecionados'}
            </Button>
          </div>
        </div>
      )}
      {(jobs.data ?? []).map((job) => (
        <div key={job.id} className="glass-card flex flex-wrap items-center gap-3 p-4">
          {job.status === 'ready' && job.output?.download_url && (
            <Checkbox
              aria-label={`Selecionar ${job.input.filename}`}
              checked={selectedJobs.has(job.id)}
              onChange={(event) =>
                setSelectedJobs((selected) => {
                  const next = new Set(selected);
                  if (event.target.checked) next.add(job.id);
                  else next.delete(job.id);
                  return next;
                })
              }
            />
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="truncate text-sm font-medium text-white">{job.input.filename}</p>
              {job.options.phase_cancel && (
                <span className="rounded-full bg-cyan-300/[0.10] px-2 py-0.5 text-[9px] uppercase tracking-wider text-cyan-200">
                  Phase Cancel
                </span>
              )}
            </div>
            <p className="text-xs uppercase tracking-wider text-white/40">
              {job.status}
              {job.options.niche?.name ? ` · ${job.options.niche.name}` : ''}
            </p>
            {job.transcript && (
              <p className="mt-2 line-clamp-2 text-xs text-white/50">
                AssemblyAI: {job.transcript}
              </p>
            )}
            {job.transcript_error && (
              <p className="mt-2 text-xs text-rose-300">AssemblyAI: {job.transcript_error}</p>
            )}
          </div>
          {job.output?.download_url && (
            <Button
              variant="outline"
              disabled={downloadingJobId === job.id}
              onClick={() => void downloadJob(job.id)}
            >
              {downloadingJobId === job.id ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {downloadingJobId === job.id ? 'Baixando…' : 'Baixar'}
            </Button>
          )}
          <Button
            variant="ghost"
            onClick={() => {
              void apiClient
                .deleteMediaJob(job.id)
                .then(() => qc.invalidateQueries({ queryKey: ['media-jobs'] }))
                .catch((error: Error) => toast.error(error.message));
            }}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}
      {!jobs.isLoading && (jobs.data?.length ?? 0) === 0 && (
        <p className="text-sm text-white/40">Nenhum processamento ainda.</p>
      )}
    </section>
  );
}
