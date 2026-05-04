'use client';

import Link from 'next/link';
import { use } from 'react';
import { ArrowLeft, CheckCircle2, Download, Loader2, Video, XCircle } from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { Button } from '@/components/ui/button';
import { useVslJob } from '@/hooks/use-vsl-job';

const STATUS_LABEL: Record<string, string> = {
  queued: 'Na fila',
  analyzing: 'Abrindo página',
  extracting: 'Detectando vídeo',
  downloading: 'Baixando segmentos',
  processing: 'Processando MP4',
  uploading: 'Enviando para storage',
  ready: 'Pronto',
  failed: 'Falhou',
};

function formatBytes(b?: number): string {
  if (!b || b <= 0) return '—';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(s?: number): string {
  if (!s || s <= 0) return '—';
  const total = Math.round(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const ss = total % 60;
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m ${String(ss).padStart(2, '0')}s`;
  return `${m}m ${String(ss).padStart(2, '0')}s`;
}

export default function VslJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const job = useVslJob(id);
  const data = job.data;

  return (
    <HubShell breadcrumb={['TOOLS', 'VSL', `JOB ${id.slice(-6).toUpperCase()}`]}>
      <div className="mx-auto max-w-2xl">
        <div className="mb-6">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/tools/vsl" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                Nova análise
              </span>
            </Link>
          </Button>
        </div>

        <header className="mb-6 space-y-2">
          <div className="flex items-center gap-2">
            <Video className="h-5 w-5 text-cyan-300" />
            <p className="hud-label">VSL Downloader · Job</p>
          </div>
          <h1 className="break-all text-xl font-semibold text-white">{data?.url ?? id}</h1>
        </header>

        <div className="glass-card space-y-6 p-6">
          {/* Status pill */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {data?.status === 'ready' ? (
                <CheckCircle2 className="h-6 w-6 text-emerald-400" />
              ) : data?.status === 'failed' ? (
                <XCircle className="h-6 w-6 text-red-400" />
              ) : (
                <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
              )}
              <div>
                <p className="hud-label">Status</p>
                <p className="text-[15px] font-semibold text-white">
                  {data ? (STATUS_LABEL[data.status] ?? data.status) : 'Carregando…'}
                </p>
              </div>
            </div>
            {data && (
              <div className="text-right">
                <p className="hud-label">Progresso</p>
                <p className="text-[15px] font-semibold text-white">{data.progress}%</p>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {data && data.status !== 'failed' && (
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div
                className="h-full transition-all"
                style={{
                  width: `${data.progress}%`,
                  background:
                    data.status === 'ready'
                      ? '#22D3EE'
                      : 'linear-gradient(90deg, #0E7C86 0%, #22D3EE 100%)',
                }}
              />
            </div>
          )}

          {/* Manifest detail */}
          {data?.manifestUrl && (
            <div className="rounded-md border border-white/[0.06] bg-black/20 p-4">
              <p className="hud-label mb-2">Manifest detectado</p>
              <p className="break-all font-mono text-[12px] text-white/70">{data.manifestUrl}</p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-white/40">
                Tipo: {data.manifestKind ?? '—'}
              </p>
            </div>
          )}

          {/* Stats */}
          {data && (data.bytes || data.durationSec) && (
            <dl className="grid grid-cols-2 gap-4 text-[13px]">
              <div>
                <dt className="hud-label">Tamanho</dt>
                <dd className="mt-1 font-mono text-white/80">{formatBytes(data.bytes)}</dd>
              </div>
              <div>
                <dt className="hud-label">Duração</dt>
                <dd className="mt-1 font-mono text-white/80">{formatDuration(data.durationSec)}</dd>
              </div>
            </dl>
          )}

          {/* Download button */}
          {data?.status === 'ready' && data.downloadUrl && (
            <Button asChild size="lg" className="w-full">
              <a href={data.downloadUrl} download={data.filename}>
                <Download className="h-4 w-4" />
                Baixar {data.filename ?? 'video.mp4'}
              </a>
            </Button>
          )}

          {/* Error */}
          {data?.status === 'failed' && data.error && (
            <div className="rounded-md border border-red-500/30 bg-red-950/20 p-4 text-[13px]">
              <p className="font-semibold text-red-300">Falha: {data.error.code}</p>
              <p className="mt-1 text-red-200/80">{data.error.message}</p>
              <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-red-300/60">
                {data.error.code === 'manifest_not_found'
                  ? 'Não conseguimos encontrar o vídeo. O cloaker pode ter bloqueado, ou o player carrega o vídeo de forma incomum. Tente novamente — ou abra o /debug pra checar a API.'
                  : data.error.code === 'download_timeout'
                    ? 'O download passou do tempo limite (10min). Vídeos muito longos ou conexões instáveis podem causar isso.'
                    : 'Veja o erro acima. Se persistir, verifique os logs do Railway.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </HubShell>
  );
}
