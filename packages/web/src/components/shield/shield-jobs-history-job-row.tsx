'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import type { ShieldJobView } from '@/lib/api-client';
import { CheckCircle2, Download, Loader2, Trash2, XCircle } from 'lucide-react';
import { formatBytes, formatDate } from './shield-jobs-history-support';

export function JobRow({
  job,
  selected,
  onToggle,
  onDelete,
}: {
  job: ShieldJobView;
  selected: boolean;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const status = job.status;
  const isReady = status === 'ready';
  const statusIcon = isReady ? (
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
        <Checkbox
          checked={selected}
          onChange={onToggle}
          disabled={!isReady}
          title={isReady ? 'Selecionar pra download em lote' : 'Apenas jobs prontos'}
        />
      </td>
      <td className="px-3 py-2">
        <span className="flex items-center gap-1.5">
          {statusIcon}
          <span
            className={
              isReady ? 'text-emerald-300' : status === 'failed' ? 'text-rose-300' : 'text-cyan-300'
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
          {isReady && job.output?.downloadUrl && (
            <Button asChild size="sm" variant="ghost">
              <a
                href={job.output.downloadUrl}
                download={job.output.filename}
                target="_blank"
                rel="noreferrer"
                title="Baixar individual"
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
