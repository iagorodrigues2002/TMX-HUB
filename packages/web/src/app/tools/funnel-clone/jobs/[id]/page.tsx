'use client';

import Link from 'next/link';
import { use } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  Network,
  XCircle,
} from 'lucide-react';
import { HubShell } from '@/components/hub/hub-shell';
import { Button } from '@/components/ui/button';
import { useFunnelJob } from '@/hooks/use-funnel-job';

const STATUS_LABEL: Record<string, string> = {
  queued: 'Na fila',
  crawling: 'Rastreando funil',
  packaging: 'Empacotando ZIP',
  uploading: 'Enviando',
  ready: 'Pronto',
  failed: 'Falhou',
};

function formatBytes(b?: number) {
  if (!b) return '—';
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

export default function FunnelJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const job = useFunnelJob(id);
  const data = job.data;

  return (
    <HubShell breadcrumb={['TOOLS', 'FUNNEL CLONE', `JOB ${id.slice(-6).toUpperCase()}`]}>
      <div className="mx-auto max-w-3xl">
        <div className="mb-6">
          <Button asChild variant="ghost" size="sm" className="-ml-2">
            <Link href="/tools/funnel-clone" className="gap-1">
              <ArrowLeft className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em]">
                Novo crawl
              </span>
            </Link>
          </Button>
        </div>

        <header className="mb-6 space-y-2">
          <div className="flex items-center gap-2">
            <Network className="h-5 w-5 text-cyan-300" />
            <p className="hud-label">Funnel Clone · Job</p>
          </div>
          <h1 className="break-all text-xl font-semibold text-white">
            {data?.rootUrl ?? id}
          </h1>
        </header>

        <div className="glass-card space-y-5 p-6">
          {/* Status */}
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
                  {data ? STATUS_LABEL[data.status] ?? data.status : 'Carregando…'}
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

          {data && (
            <dl className="grid grid-cols-3 gap-4 text-[13px]">
              <div>
                <dt className="hud-label">Páginas</dt>
                <dd className="mt-1 font-mono text-white/80">
                  {data.pages.length} / {data.maxPages}
                </dd>
              </div>
              <div>
                <dt className="hud-label">Profundidade</dt>
                <dd className="mt-1 font-mono text-white/80">
                  {Math.max(0, ...data.pages.map((p) => p.depth))} / {data.maxDepth}
                </dd>
              </div>
              <div>
                <dt className="hud-label">ZIP</dt>
                <dd className="mt-1 font-mono text-white/80">
                  {formatBytes(data.totalBytes)}
                </dd>
              </div>
            </dl>
          )}

          {/* Pages tree */}
          {data && data.pages.length > 0 && (
            <div className="rounded-md border border-white/[0.06] bg-black/20">
              <p className="hud-label border-b border-white/[0.06] px-3 py-2">
                Páginas descobertas
              </p>
              <ul className="divide-y divide-white/[0.04] text-[12px]">
                {data.pages.map((p) => (
                  <li key={p.url + p.index} className="px-3 py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span
                        className="flex items-center gap-2 truncate"
                        style={{ paddingLeft: p.depth * 12 }}
                      >
                        <span className="rounded-sm border border-cyan-300/30 px-1 py-px text-[9px] font-bold uppercase tracking-[0.16em] text-cyan-300">
                          d{p.depth}
                        </span>
                        <span className="truncate text-white/85">{p.label || '(sem label)'}</span>
                      </span>
                      <span className="shrink-0 font-mono text-[10px] text-white/40">
                        {p.error ? '⚠ erro' : formatBytes(p.bytes)}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate font-mono text-[10px] text-white/40" style={{ paddingLeft: p.depth * 12 + 30 }}>
                      {p.url}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Download */}
          {data?.status === 'ready' && data.downloadUrl && (
            <Button asChild size="lg" className="w-full">
              <a href={data.downloadUrl} download={data.filename}>
                <Download className="h-4 w-4" />
                Baixar {data.filename ?? 'funnel.zip'}
              </a>
            </Button>
          )}

          {/* Error */}
          {data?.status === 'failed' && data.error && (
            <div className="rounded-md border border-red-500/30 bg-red-950/20 p-4 text-[13px]">
              <p className="font-semibold text-red-300">Falha: {data.error.code}</p>
              <p className="mt-1 text-red-200/80">{data.error.message}</p>
            </div>
          )}
        </div>
      </div>
    </HubShell>
  );
}
