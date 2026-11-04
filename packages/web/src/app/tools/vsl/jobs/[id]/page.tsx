'use client';

import { HubShell } from '@/components/hub/hub-shell';
import { Button } from '@/components/ui/button';
import { useVslJob } from '@/hooks/use-vsl-job';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Download,
  Loader2,
  ShieldCheck,
  Video,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { use } from 'react';

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

interface VariantCardProps {
  label: 'BLACK' | 'WHITE';
  description: string;
  manifestUrl?: string;
  manifestKind?: string;
  bytes?: number;
  filename?: string;
  downloadUrl?: string;
  /** Whether to show the inline video preview (only for the variant that has it). */
  showPreview?: boolean;
}

function VariantCard(props: VariantCardProps) {
  const isBlack = props.label === 'BLACK';
  const accent = isBlack ? 'border-border bg-accent' : 'border-success/30 bg-success/10';
  const labelColor = isBlack ? 'text-primary' : 'text-success';

  return (
    <div className={`rounded-md border ${accent} p-4 space-y-3`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span
            className={`rounded-sm border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.2em] ${labelColor} ${
              isBlack ? 'border-border' : 'border-success/30'
            }`}
          >
            {props.label}
          </span>
          <span className="text-[12px] text-muted-foreground">{props.description}</span>
        </div>
        <span className="font-mono text-[10px] uppercase text-muted-foreground">
          {props.manifestKind ?? '—'}
        </span>
      </div>

      {props.manifestUrl && (
        <p className="break-all font-mono text-[11px] text-muted-foreground">{props.manifestUrl}</p>
      )}

      {props.showPreview && props.downloadUrl && (
        <video
          controls
          preload="metadata"
          className="w-full rounded border border-border bg-background"
          src={props.downloadUrl}
        >
          <track kind="captions" />
        </video>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-[11px] text-muted-foreground">{formatBytes(props.bytes)}</span>
        {props.downloadUrl && (
          <Button asChild size="sm" variant={isBlack ? 'default' : 'outline'}>
            <a href={props.downloadUrl} download={props.filename}>
              <Download className="h-3.5 w-3.5" />
              Baixar
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}

export default function VslJobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const job = useVslJob(id);
  const data = job.data;

  return (
    <HubShell breadcrumb={['TOOLS', 'VSL', `JOB ${id.slice(-6).toUpperCase()}`]}>
      <div className="mx-auto max-w-3xl">
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
            <Video className="h-5 w-5 text-primary" />
            <p className="hud-label">VSL Downloader · Job</p>
          </div>
          <h1 className="break-all text-xl font-semibold text-foreground">{data?.url ?? id}</h1>
        </header>

        <div className="glass-card space-y-6 p-6">
          {/* Status pill */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {data?.status === 'ready' ? (
                <CheckCircle2 className="h-6 w-6 text-success" />
              ) : data?.status === 'failed' ? (
                <XCircle className="h-6 w-6 text-danger" />
              ) : (
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
              )}
              <div>
                <p className="hud-label">Status</p>
                <p className="text-[15px] font-semibold text-foreground">
                  {data ? (STATUS_LABEL[data.status] ?? data.status) : 'Carregando…'}
                </p>
              </div>
            </div>
            {data && (
              <div className="text-right">
                <p className="hud-label">Progresso</p>
                <p className="text-[15px] font-semibold text-foreground">{data.progress}%</p>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {data && data.status !== 'failed' && (
            <div className="h-1.5 overflow-hidden rounded-full bg-accent">
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

          {/* Cloaker banner — visible when ready */}
          {data?.status === 'ready' && data.cloakerDetected !== undefined && (
            <div
              className={`flex items-start gap-3 rounded-md border p-4 ${
                data.cloakerDetected
                  ? 'border-warning/30 bg-warning/10'
                  : 'border-success/30 bg-success/10'
              }`}
            >
              {data.cloakerDetected ? (
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              ) : (
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-success" />
              )}
              <div className="flex-1">
                <p
                  className={`text-[13px] font-semibold ${
                    data.cloakerDetected ? 'text-warning' : 'text-success'
                  }`}
                >
                  {data.cloakerDetected
                    ? 'Cloaker DETECTADO — duas versões diferentes'
                    : 'Sem cloaker — versão única'}
                </p>
                <p className="mt-1 text-[12px] text-muted-foreground">
                  {data.cloakerDetected
                    ? 'A página retorna manifests diferentes para tráfego pago (BLACK) e tráfego direto (WHITE). Baixamos as duas para você comparar.'
                    : 'A mesma versão é servida tanto para tráfego pago quanto para visitas diretas — não há cloaker ativo.'}
                </p>
              </div>
            </div>
          )}

          {/* Stats — always shown when ready */}
          {data?.status === 'ready' && (
            <dl className="grid grid-cols-2 gap-4 text-[13px]">
              <div>
                <dt className="hud-label">Duração</dt>
                <dd className="mt-1 font-mono text-foreground">
                  {formatDuration(data.durationSec)}
                </dd>
              </div>
              <div>
                <dt className="hud-label">Tipo</dt>
                <dd className="mt-1 font-mono uppercase text-foreground">
                  {data.manifestKind ?? '—'}
                </dd>
              </div>
            </dl>
          )}

          {/* Variants — black + white when cloaker, single when not */}
          {data?.status === 'ready' && (
            <div className="space-y-4">
              <VariantCard
                label="BLACK"
                description={
                  data.cloakerDetected
                    ? 'Versão real, vista por tráfego pago (fbclid, utm_*)'
                    : 'Único manifest detectado'
                }
                manifestUrl={data.manifestUrl}
                manifestKind={data.manifestKind}
                bytes={data.bytes}
                filename={data.filename}
                downloadUrl={data.downloadUrl}
                showPreview
              />
              {data.cloakerDetected && data.whiteManifestUrl && (
                <VariantCard
                  label="WHITE"
                  description="Versão limpa, vista por visitas orgânicas / FB reviewers"
                  manifestUrl={data.whiteManifestUrl}
                  manifestKind={data.manifestKind}
                  bytes={data.whiteBytes}
                  filename={data.whiteFilename}
                  downloadUrl={data.whiteDownloadUrl}
                  showPreview
                />
              )}
            </div>
          )}

          {/* In-progress manifest hint */}
          {data && data.status !== 'ready' && data.status !== 'failed' && data.manifestUrl && (
            <div className="rounded-md border border-border bg-accent p-4">
              <p className="hud-label mb-2">Manifest detectado</p>
              <p className="break-all font-mono text-[12px] text-muted-foreground">
                {data.manifestUrl}
              </p>
              <p className="mt-2 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
                Tipo: {data.manifestKind ?? '—'}
                {data.cloakerDetected && ' · cloaker detectado, baixando ambas versões'}
              </p>
            </div>
          )}

          {/* Error */}
          {data?.status === 'failed' && data.error && (
            <div className="rounded-md border border-danger/30 bg-danger/10 p-4 text-[13px]">
              <p className="font-semibold text-danger">Falha: {data.error.code}</p>
              <p className="mt-1 text-danger">{data.error.message}</p>
              <p className="mt-3 text-[11px] uppercase tracking-[0.18em] text-danger">
                {data.error.code === 'manifest_not_found'
                  ? 'O player não carregou nenhum vídeo. Tente colar a URL completa, com os parâmetros do anúncio (fbclid, utm_*, gclid). Muitos players de VSL só servem o vídeo pra tráfego que parece pago.'
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
