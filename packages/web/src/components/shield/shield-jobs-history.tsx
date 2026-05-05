'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  Download,
  Loader2,
  RefreshCw,
  Trash2,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, type ShieldJobView } from '@/lib/api-client';
import { Button } from '@/components/ui/button';

function formatBytes(b?: number): string {
  if (!b) return '—';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function ShieldJobsHistory() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'ready' | 'working' | 'failed'>('all');

  const { data, isLoading, refetch, isFetching } = useQuery<ShieldJobView[]>({
    queryKey: ['shield-jobs-list'],
    queryFn: () => apiClient.listShieldJobs(),
    refetchInterval: (q) => {
      const jobs = q.state.data ?? [];
      const anyWorking = jobs.some(
        (j) => j.status === 'queued' || j.status === 'processing' || j.status === 'verifying',
      );
      return anyWorking ? 5000 : false;
    },
    refetchOnWindowFocus: false,
  });

  const jobs = data ?? [];

  const filtered = useMemo(() => {
    if (filter === 'all') return jobs;
    if (filter === 'ready') return jobs.filter((j) => j.status === 'ready');
    if (filter === 'failed') return jobs.filter((j) => j.status === 'failed');
    return jobs.filter(
      (j) => j.status === 'queued' || j.status === 'processing' || j.status === 'verifying',
    );
  }, [jobs, filter]);

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteShieldJob(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['shield-jobs-list'] });
      toast.success('Job removido.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="hud-label">Histórico</p>
          <h2 className="mt-1 text-[16px] font-semibold text-white">
            {jobs.length} job(s) recente(s)
          </h2>
        </div>
        <div className="flex items-center gap-2">
          <FilterButton value="all" current={filter} onClick={setFilter} count={jobs.length} />
          <FilterButton
            value="working"
            current={filter}
            onClick={setFilter}
            count={
              jobs.filter(
                (j) =>
                  j.status === 'queued' || j.status === 'processing' || j.status === 'verifying',
              ).length
            }
            label="Em curso"
          />
          <FilterButton
            value="ready"
            current={filter}
            onClick={setFilter}
            count={jobs.filter((j) => j.status === 'ready').length}
            label="Prontos"
          />
          <FilterButton
            value="failed"
            current={filter}
            onClick={setFilter}
            count={jobs.filter((j) => j.status === 'failed').length}
            label="Falhas"
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => refetch()}
            disabled={isFetching}
            title="Recarregar"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="glass-card flex items-center justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-card p-8 text-center text-[13px] text-white/45">
          {jobs.length === 0
            ? 'Nenhum job ainda. Suba um vídeo no formulário acima.'
            : 'Nenhum job nesse filtro.'}
        </div>
      ) : (
        <div className="glass-card overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead className="bg-white/[0.03] text-left text-[10px] font-semibold uppercase tracking-[0.16em] text-white/55">
                <tr>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">Arquivo</th>
                  <th className="px-3 py-2">Nicho · White</th>
                  <th className="px-3 py-2">Compressão</th>
                  <th className="px-3 py-2 text-right">Tamanho</th>
                  <th className="px-3 py-2">Quando</th>
                  <th className="px-3 py-2 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((j) => (
                  <JobRow
                    key={j.id}
                    job={j}
                    onDelete={() => {
                      if (confirm(`Remover job "${j.input.filename}"?`)) deleteMut.mutate(j.id);
                    }}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterButton({
  value,
  current,
  onClick,
  count,
  label,
}: {
  value: 'all' | 'ready' | 'working' | 'failed';
  current: string;
  onClick: (v: 'all' | 'ready' | 'working' | 'failed') => void;
  count: number;
  label?: string;
}) {
  const active = current === value;
  return (
    <button
      type="button"
      onClick={() => onClick(value)}
      className={`rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors ${
        active
          ? 'border-cyan-300/40 bg-cyan-300/10 text-cyan-200'
          : 'border-white/[0.10] bg-white/[0.03] text-white/55 hover:bg-white/[0.06]'
      }`}
    >
      {label ?? (value === 'all' ? 'Todos' : value)} ({count})
    </button>
  );
}

function JobRow({ job, onDelete }: { job: ShieldJobView; onDelete: () => void }) {
  const status = job.status;
  const statusIcon =
    status === 'ready' ? (
      <CheckCircle2 className="h-3 w-3 text-emerald-300" />
    ) : status === 'failed' ? (
      <XCircle className="h-3 w-3 text-rose-300" />
    ) : (
      <Loader2 className="h-3 w-3 animate-spin text-cyan-300" />
    );
  const statusText = {
    queued: 'Fila',
    processing: 'Processando',
    verifying: 'Verificando',
    ready: 'Pronto',
    failed: 'Falhou',
  }[status];

  return (
    <tr className="border-t border-white/[0.04]">
      <td className="px-3 py-2">
        <span className="flex items-center gap-1.5">
          {statusIcon}
          <span
            className={
              status === 'ready'
                ? 'text-emerald-300'
                : status === 'failed'
                  ? 'text-rose-300'
                  : 'text-cyan-300'
            }
          >
            {statusText}
          </span>
        </span>
      </td>
      <td className="max-w-[260px] truncate px-3 py-2 text-white/85" title={job.input.filename}>
        {job.input.filename}
      </td>
      <td className="px-3 py-2 text-white/65">
        {job.niche.name}
        <span className="text-white/35"> · </span>
        <span className="text-white/55">{job.white.label}</span>
      </td>
      <td className="px-3 py-2 font-mono text-[11px] text-white/55">{job.compression}</td>
      <td className="px-3 py-2 text-right font-mono text-[11px] text-white/55">
        {formatBytes(job.output?.bytes ?? job.input.bytes)}
      </td>
      <td className="px-3 py-2 text-white/45">{formatDate(job.createdAt)}</td>
      <td className="px-3 py-2 text-right">
        <div className="flex items-center justify-end gap-1">
          {status === 'ready' && job.output?.downloadUrl && (
            <Button asChild size="sm" variant="ghost">
              <a
                href={job.output.downloadUrl}
                download={job.output.filename}
                target="_blank"
                rel="noreferrer"
                title="Baixar"
              >
                <Download className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDelete} title="Remover">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </td>
    </tr>
  );
}
