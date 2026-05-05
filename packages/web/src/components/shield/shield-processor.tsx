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
  Trash2,
  Upload,
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

/** Maximum simultaneous uploads to keep network/UI sane. */
const PARALLEL_UPLOADS = 3;

interface UploadSlot {
  id: string;             // local unique id
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'failed';
  progress: number;       // 0..100
  jobId?: string;
  error?: string;
}

function newSlotId(): string {
  return `up_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / 1024 / 1024).toFixed(1)} MB`;
  return `${(b / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function ShieldProcessor({ niches }: { niches: NicheView[] }) {
  const qc = useQueryClient();
  const [slots, setSlots] = useState<UploadSlot[]>([]);
  const [nicheId, setNicheId] = useState<string>('');
  const [whiteVolumeDb, setWhiteVolumeDb] = useState(-22);
  const [compression, setCompression] = useState<ShieldCompressionMode>('none');
  const [verifyTranscript, setVerifyTranscript] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Default niche selection: first one with whites.
  useEffect(() => {
    if (!nicheId && niches.length > 0) {
      const first = niches.find((n) => n.whites.length > 0) ?? niches[0];
      if (first) setNicheId(first.id);
    }
  }, [niches, nicheId]);

  const selectedNiche = niches.find((n) => n.id === nicheId);
  const pendingCount = slots.filter((s) => s.status === 'pending').length;
  const uploadingCount = slots.filter((s) => s.status === 'uploading').length;
  const doneCount = slots.filter((s) => s.status === 'done').length;
  const failedCount = slots.filter((s) => s.status === 'failed').length;
  const activeJobIds = slots.filter((s) => s.jobId).map((s) => s.jobId!);

  const onAddFiles = (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    const adds: UploadSlot[] = [];
    for (const f of Array.from(fileList)) {
      adds.push({
        id: newSlotId(),
        file: f,
        status: 'pending',
        progress: 0,
      });
    }
    setSlots((s) => [...s, ...adds]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const removeSlot = (id: string) => {
    setSlots((s) => s.filter((x) => x.id !== id));
  };
  const clearAll = () => {
    setSlots([]);
  };

  const uploadOne = async (slot: UploadSlot): Promise<void> => {
    setSlots((s) =>
      s.map((x) => (x.id === slot.id ? { ...x, status: 'uploading', progress: 0 } : x)),
    );
    try {
      const job = await apiClient.createShieldJob(
        {
          file: slot.file,
          nicheId,
          whiteVolumeDb,
          compression,
          verifyTranscript,
        },
        (pct) => {
          setSlots((s) =>
            s.map((x) => (x.id === slot.id ? { ...x, progress: pct } : x)),
          );
        },
      );
      setSlots((s) =>
        s.map((x) =>
          x.id === slot.id
            ? { ...x, status: 'done', progress: 100, jobId: job.id }
            : x,
        ),
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setSlots((s) =>
        s.map((x) => (x.id === slot.id ? { ...x, status: 'failed', error: msg } : x)),
      );
    }
  };

  const onSubmit = async () => {
    const pending = slots.filter((s) => s.status === 'pending');
    if (pending.length === 0) {
      toast.error('Selecione pelo menos um vídeo.');
      return;
    }
    if (!nicheId) {
      toast.error('Selecione um nicho.');
      return;
    }
    if (!selectedNiche || selectedNiche.whites.length === 0) {
      toast.error('Esse nicho não tem áudios white.');
      return;
    }

    setSubmitting(true);
    try {
      // Concurrency-limited upload pool.
      const queue = [...pending];
      const workers: Promise<void>[] = [];
      const runNext = async (): Promise<void> => {
        const next = queue.shift();
        if (!next) return;
        await uploadOne(next);
        return runNext();
      };
      for (let i = 0; i < Math.min(PARALLEL_UPLOADS, queue.length); i++) {
        workers.push(runNext());
      }
      await Promise.all(workers);
      qc.invalidateQueries({ queryKey: ['shield-jobs-list'] });
      toast.success('Uploads concluídos.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="hud-label">Processar vídeos</p>
        <h2 className="mt-1 text-[16px] font-semibold text-white">
          Phase Cancel + White (envio em massa)
        </h2>
      </div>

      <div className="glass-card space-y-5 p-5">
        {/* File picker — multi */}
        <div className="space-y-2">
          <Label className="hud-label">
            Vídeos ({slots.length} selecionado{slots.length === 1 ? '' : 's'})
          </Label>
          <div
            className="rounded-md border border-dashed border-white/[0.12] bg-white/[0.02] p-4 text-center"
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDrop={(e) => {
              e.preventDefault();
              onAddFiles(e.dataTransfer.files);
            }}
          >
            <Upload className="mx-auto mb-2 h-5 w-5 text-cyan-300/70" />
            <p className="text-[12px] text-white/65">
              Arraste vídeos aqui, ou{' '}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                className="text-cyan-300 hover:text-cyan-200"
              >
                clique pra selecionar
              </button>
            </p>
            <p className="mt-1 text-[10px] text-white/35">
              Múltipla seleção · MP4/MOV/AVI/WEBM/MKV · até 100MB cada
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="video/*,audio/*"
              multiple
              className="hidden"
              onChange={(e) => onAddFiles(e.target.files)}
              disabled={submitting}
            />
          </div>

          {slots.length > 0 && (
            <div className="space-y-1">
              <div className="flex items-center justify-between pt-1">
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">
                  {pendingCount} pendente · {uploadingCount} subindo · {doneCount} ok ·{' '}
                  {failedCount} falha
                </p>
                <button
                  type="button"
                  onClick={clearAll}
                  disabled={submitting}
                  className="text-[10px] uppercase tracking-[0.14em] text-white/40 hover:text-rose-300 disabled:opacity-30"
                >
                  Limpar tudo
                </button>
              </div>
              <ul className="max-h-[260px] space-y-1 overflow-y-auto rounded-md border border-white/[0.06] bg-black/15 p-2">
                {slots.map((s) => (
                  <SlotRow key={s.id} slot={s} onRemove={() => removeSlot(s.id)} />
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Niche */}
        <div className="space-y-2">
          <Label className="hud-label">Nicho do white audio</Label>
          <Select value={nicheId} onValueChange={setNicheId} disabled={submitting}>
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
          {selectedNiche && selectedNiche.whites.length > 0 && slots.length > 1 && (
            <p className="text-[11px] text-white/40">
              <Shuffle className="mr-1 inline h-3 w-3 text-cyan-300/70" />
              Cada vídeo do batch sorteia 1 dos {selectedNiche.whites.length} áudios independentemente.
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
            disabled={submitting}
            className="w-full accent-cyan-400"
          />
          <p className="text-[10px] text-white/40">
            Recomendado: -22 dB. Mais baixo = menos audível pra humano.
          </p>
        </div>

        {/* Compression */}
        <div className="space-y-2">
          <Label className="hud-label">Compressão (aplica em todos)</Label>
          <Select
            value={compression}
            onValueChange={(v) => setCompression(v as ShieldCompressionMode)}
            disabled={submitting}
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
            disabled={submitting}
            className="mt-0.5"
          />
          <span>
            <span className="block font-semibold text-white">
              Verificar com AssemblyAI (~$0.04/min)
            </span>
            <span className="block text-[11px] text-white/50">
              Roda transcrição em cada vídeo final pra confirmar que IA só captura o white.
            </span>
          </span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            onClick={onSubmit}
            disabled={
              submitting ||
              pendingCount === 0 ||
              !selectedNiche ||
              selectedNiche.whites.length === 0
            }
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {submitting
              ? 'Subindo…'
              : pendingCount > 1
                ? `Processar ${pendingCount} vídeos`
                : 'Processar'}
          </Button>
        </div>
      </div>

      {/* Active jobs (this session) */}
      {activeJobIds.length > 0 && (
        <div className="space-y-3">
          <p className="hud-label">Em processamento ({activeJobIds.length})</p>
          {activeJobIds.map((id) => (
            <ShieldJobStatus key={id} jobId={id} />
          ))}
        </div>
      )}
    </div>
  );
}

function SlotRow({ slot, onRemove }: { slot: UploadSlot; onRemove: () => void }) {
  const icon =
    slot.status === 'done' ? (
      <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-300" />
    ) : slot.status === 'failed' ? (
      <XCircle className="h-3 w-3 shrink-0 text-rose-300" />
    ) : slot.status === 'uploading' ? (
      <Loader2 className="h-3 w-3 shrink-0 animate-spin text-cyan-300" />
    ) : (
      <FileVideo className="h-3 w-3 shrink-0 text-white/45" />
    );
  return (
    <li className="rounded px-2 py-1.5 hover:bg-white/[0.03]">
      <div className="flex items-center gap-2 text-[12px]">
        {icon}
        <span className="flex-1 truncate text-white/85" title={slot.file.name}>
          {slot.file.name}
        </span>
        <span className="shrink-0 font-mono text-[10px] text-white/40">
          {formatBytes(slot.file.size)}
        </span>
        {slot.status === 'pending' && (
          <button
            type="button"
            onClick={onRemove}
            className="text-white/40 hover:text-rose-300"
            title="Remover da fila"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
      {slot.status === 'uploading' && (
        <div className="ml-5 mt-1 h-0.5 overflow-hidden rounded-full bg-white/[0.08]">
          <div
            className="h-full bg-cyan-300/70 transition-all"
            style={{ width: `${slot.progress}%` }}
          />
        </div>
      )}
      {slot.status === 'failed' && slot.error && (
        <p className="ml-5 mt-1 truncate text-[10px] text-rose-300/85" title={slot.error}>
          {slot.error}
        </p>
      )}
    </li>
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
