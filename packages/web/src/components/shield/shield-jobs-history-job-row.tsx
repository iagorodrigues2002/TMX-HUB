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
    <CheckCircle2 className="h-3 w-3 text-success" />
  ) : status === 'failed' ? (
    <XCircle className="h-3 w-3 text-danger" />
  ) : (
    <Loader2 className="h-3 w-3 animate-spin text-primary" />
  );
  const statusText = {
    queued: 'Fila',
    processing: 'Processando',
    verifying: 'Verificando',
    ready: 'Pronto',
    failed: 'Falhou',
  }[status];

  return (
    <tr className="border-t border-border">
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
              isReady ? 'text-success' : status === 'failed' ? 'text-danger' : 'text-primary'
            }
          >
            {statusText}
          </span>
        </span>
      </td>
      <td className="max-w-[260px] truncate px-3 py-2 text-foreground" title={job.input.filename}>
        {job.input.filename}
      </td>
      <td className="px-3 py-2 text-muted-foreground">
        {job.niche.name}
        <span className="text-muted-foreground"> · </span>
        <span className="text-muted-foreground">{job.white.label}</span>
      </td>
      <td className="px-3 py-2 font-mono text-[11px] text-muted-foreground">{job.compression}</td>
      <td className="px-3 py-2 text-right font-mono text-[11px] text-muted-foreground">
        {formatBytes(job.output?.bytes ?? job.input.bytes)}
      </td>
      <td className="px-3 py-2 text-muted-foreground">{formatDate(job.createdAt)}</td>
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
