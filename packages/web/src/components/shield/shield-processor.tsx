'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileVideo,
  Loader2,
  Shuffle,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  apiClient,
  type NicheView,
  type ShieldCompressionMode,
  type ShieldJobView,
} from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const COMPRESSION_OPTIONS: Array<{ value: ShieldCompressionMode; label: string; hint: string }> = [
  { value: 'none', label: 'Sem compressão', hint: 'mais rápido — não re-encoda o vídeo' },
  { value: 'lossless', label: 'Sem perda visível', hint: 'CRF 18 — qualidade máxima' },
  { value: 'balanced', label: 'Equilibrado', hint: 'CRF 23 — redução típica de 50%' },
  { value: 'small', label: 'Tamanho mínimo', hint: 'CRF 28 — perda visível em close inspect' },
];

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function ShieldProcessor({ niches }: { niches: NicheView[] }) {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [nicheId, setNicheId] = useState<string>('');
  const [whiteVolumeDb, setWhiteVolumeDb] = useState(-22);
  const [compression, setCompression] = useState<ShieldCompressionMode>('none');
  const [verifyTranscript, setVerifyTranscript] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Default niche selection: first one available with whites.
  useEffect(() => {
    if (!nicheId && niches.length > 0) {
      const first = niches.find((n) => n.whites.length > 0) ?? niches[0];
      if (first) setNicheId(first.id);
    }
  }, [niches, nicheId]);

  const selectedNiche = niches.find((n) => n.id === nicheId);

  const createMut = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Selecione um vídeo primeiro.');
      if (!nicheId) throw new Error('Selecione um nicho.');
      setProgress(0);
      return apiClient.createShieldJob(
        { file, nicheId, whiteVolumeDb, compression, verifyTranscript },
        (pct) => setProgress(pct),
      );
    },
    onSuccess: (job) => {
      setActiveJobId(job.id);
      setProgress(null);
      qc.invalidateQueries({ queryKey: ['shield-jobs'] });
      toast.success('Upload concluído. Processando…');
    },
    onError: (err) => {
      setProgress(null);
      toast.error((err as Error).message);
    },
  });

  const reset = () => {
    setActiveJobId(null);
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="hud-label">Processar vídeo</p>
        <h2 className="mt-1 text-[16px] font-semibold text-white">
          Aplicar Phase Cancel + White
        </h2>
      </div>

      <div className="glass-card space-y-5 p-5">
        {/* File picker */}
        <div className="space-y-2">
          <Label className="hud-label">Vídeo (mp4, mov, avi, webm, mkv — até 100MB)</Label>
          <input
            ref={fileRef}
            type="file"
            accept="video/*,audio/*"
            disabled={createMut.isPending}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-[13px] text-white/75 file:mr-3 file:rounded file:border-0 file:bg-cyan-300/15 file:px-3 file:py-1.5 file:text-[11px] file:font-semibold file:uppercase file:tracking-[0.14em] file:text-cyan-200 hover:file:bg-cyan-300/25"
          />
          {file && (
            <p className="text-[11px] text-white/55">
              <FileVideo className="mr-1 inline h-3 w-3 text-cyan-300/70" />
              {file.name} · {formatBytes(file.size)}
            </p>
          )}
        </div>

        {/* Niche selection */}
        <div className="space-y-2">
          <Label className="hud-label">Nicho do white audio</Label>
          <Select value={nicheId} onValueChange={setNicheId} disabled={createMut.isPending}>
            <SelectTrigger>
              <SelectValue placeholder="Escolha um nicho…" />
            </SelectTrigger>
            <SelectContent>
              {niches.map((n) => (
                <SelectItem key={n.id} value={n.id} disabled={n.whites.length === 0}>
                  {n.name} · {n.whites.length} white(s)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {selectedNiche && selectedNiche.whites.length === 0 && (
            <p className="flex items-start gap-1.5 text-[11px] text-amber-300/85">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              Esse nicho ainda não tem áudios. Adicione pelo menos 1 na seção <strong>Nichos</strong>.
            </p>
          )}
          {selectedNiche && selectedNiche.whites.length > 0 && (
            <p className="text-[11px] text-white/40">
              <Shuffle className="mr-1 inline h-3 w-3 text-cyan-300/70" />1 dos{' '}
              {selectedNiche.whites.length} áudios será sorteado aleatoriamente no processamento.
            </p>
          )}
        </div>

        {/* Volume slider */}
        <div className="space-y-2">
          <Label className="hud-label flex items-center justify-between">
            <span>Volume do white (dB)</span>
            <span className="font-mono text-[11px] text-white/65">{whiteVolumeDb} dB</span>
          </Label>
          <input
            type="range"
            min={-40}
            max={-5}
            step={1}
            value={whiteVolumeDb}
            onChange={(e) => setWhiteVolumeDb(Number(e.target.value))}
            disabled={createMut.isPending}
            className="w-full accent-cyan-400"
          />
          <p className="text-[10px] text-white/40">
            Recomendado: -22 dB. Mais baixo = menos audível pra humano (mas o bot já transcreve igual).
          </p>
        </div>

        {/* Compression */}
        <div className="space-y-2">
          <Label className="hud-label">Compressão</Label>
          <Select
            value={compression}
            onValueChange={(v) => setCompression(v as ShieldCompressionMode)}
            disabled={createMut.isPending}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COMPRESSION_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label} — {o.hint}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Verify */}
        <label className="flex items-start gap-3 text-[13px] text-white/75">
          <Checkbox
            checked={verifyTranscript}
            onChange={(e) => setVerifyTranscript(e.target.checked)}
            disabled={createMut.isPending}
            className="mt-0.5"
          />
          <span>
            <span className="block font-semibold text-white">
              Verificar com AssemblyAI (~$0.04/min)
            </span>
            <span className="block text-[11px] text-white/50">
              Roda transcrição no resultado pra confirmar que IA só captura o white.
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          {activeJobId && (
            <Button variant="outline" onClick={reset} disabled={createMut.isPending}>
              Novo processamento
            </Button>
          )}
          <Button
            onClick={() => createMut.mutate()}
            disabled={
              createMut.isPending ||
              !file ||
              !selectedNiche ||
              selectedNiche.whites.length === 0
            }
          >
            {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Processar
          </Button>
        </div>

        {progress !== null && (
          <div>
            <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
              <div
                className="h-full bg-cyan-300/70 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-white/50">Enviando… {progress}%</p>
          </div>
        )}
      </div>

      {activeJobId && <ShieldJobStatus jobId={activeJobId} />}
    </div>
  );
}

function ShieldJobStatus({ jobId }: { jobId: string }) {
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
        status === 'failed'
          ? 'border-rose-300/30'
          : status === 'ready'
            ? 'border-cyan-300/30'
            : ''
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
        <Button size="sm" variant="ghost" onClick={() => refetch()} disabled={isWorking}>
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
                  <>
                    {' '}
                    · {Math.round((data.output.bytes / data.input.bytes) * 100)}% do original
                  </>
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
