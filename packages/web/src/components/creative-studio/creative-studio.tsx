'use client';

import { NicheManager } from '@/components/shield/niche-manager';
import { ShieldJobsHistory } from '@/components/shield/shield-jobs-history';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  type MediaAspectRatio,
  type MediaCompressionMode,
  type MediaExtensionMode,
  type NicheView,
  apiClient,
} from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AudioLines,
  BrainCircuit,
  CheckCircle2,
  Download,
  Gauge,
  Loader2,
  Maximize2,
  Package,
  Repeat2,
  Shield,
  ShieldCheck,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

const compressionOptions = [
  { value: 'none', label: 'Qualidade máxima', description: 'Mantém o máximo de detalhes' },
  { value: 'balanced', label: 'Equilibrada', description: 'Boa qualidade com tamanho reduzido' },
  { value: 'small', label: 'Arquivo menor', description: 'Prioriza velocidade e economia' },
] as const;

const aspectRatioOptions = [
  { value: 'original', label: 'Original', description: 'Preserva o formato do vídeo' },
  { value: '9:16', label: '9:16 · Stories/Reels', description: 'Vertical para telas de celular' },
  { value: '4:5', label: '4:5 · Feed', description: 'Vertical para publicações no feed' },
  { value: '1:1', label: '1:1 · Quadrado', description: 'Formato quadrado universal' },
] as const;

const extensionOptions = [
  { value: 'none', label: 'Não estender', description: 'Mantém a duração original' },
  { value: 'loop', label: 'Repetir em loop', description: 'Repete até a duração escolhida' },
  { value: 'freeze', label: 'Congelar frame final', description: 'Segura a última imagem' },
] as const;

const MAX_BATCH_FILES = 30;
const MAX_FILE_BYTES = 500 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 2;
const MAX_BULK_BYTES = 3 * 1024 * 1024 * 1024;

type UploadItem = {
  id: string;
  file: File;
  status: 'pending' | 'uploading' | 'done' | 'failed';
  progress: number;
  error?: string;
};

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

export function CreativeStudio({
  niches,
  nichesLoading,
}: { niches: NicheView[]; nichesLoading: boolean }) {
  const qc = useQueryClient();
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [compression, setCompression] = useState<MediaCompressionMode>('balanced');
  const [aspectRatio, setAspectRatio] = useState<MediaAspectRatio>('original');
  const [stripMetadata, setStripMetadata] = useState(true);
  const [normalizeAudio, setNormalizeAudio] = useState(true);
  const [extensionMode, setExtensionMode] = useState<MediaExtensionMode>('none');
  const [targetSeconds, setTargetSeconds] = useState(30);
  const [phaseCancel, setPhaseCancel] = useState(false);
  const [nicheId, setNicheId] = useState('');
  const [whiteVolumeDb, setWhiteVolumeDb] = useState(-22);
  const [verifyTranscript, setVerifyTranscript] = useState(false);

  const jobs = useQuery({
    queryKey: ['media-jobs'],
    queryFn: () => apiClient.listMediaJobs(),
    refetchInterval: (query) =>
      query.state.data?.some(
        (job) =>
          job.status === 'queued' || job.status === 'processing' || job.status === 'verifying',
      )
        ? 2_000
        : false,
  });

  const readyJobs = useMemo(
    () => (jobs.data ?? []).filter((job) => job.status === 'ready' && job.output?.download_url),
    [jobs.data],
  );
  const selectedReadyJobs = useMemo(
    () => readyJobs.filter((job) => selectedJobs.has(job.id)),
    [readyJobs, selectedJobs],
  );
  const selectedBytes = selectedReadyJobs.reduce(
    (total, job) => total + (job.output?.bytes ?? 0),
    0,
  );

  const addFiles = (files: FileList | null) => {
    if (!files) return;
    const incoming = Array.from(files);
    const invalid = incoming.filter(
      (file) => file.size > MAX_FILE_BYTES || !/\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(file.name),
    );
    if (invalid.length > 0) {
      toast.error(
        `${invalid.length} arquivo(s) ignorado(s). Use formatos aceitos com até 500 MB cada.`,
      );
    }
    setUploadItems((current) => {
      const existing = new Set(
        current.map((item) => `${item.file.name}:${item.file.size}:${item.file.lastModified}`),
      );
      const valid = incoming
        .filter(
          (file) => file.size <= MAX_FILE_BYTES && /\.(mp4|mov|avi|webm|mkv|m4v)$/i.test(file.name),
        )
        .filter((file) => {
          const key = `${file.name}:${file.size}:${file.lastModified}`;
          if (existing.has(key)) return false;
          existing.add(key);
          return true;
        })
        .slice(0, Math.max(0, MAX_BATCH_FILES - current.length))
        .map((file) => ({
          id: crypto.randomUUID(),
          file,
          status: 'pending' as const,
          progress: 0,
        }));
      if (current.length + valid.length < current.length + incoming.length - invalid.length) {
        toast.warning(`O limite é de ${MAX_BATCH_FILES} vídeos por lote.`);
      }
      return [...current, ...valid];
    });
  };

  const processBatch = async () => {
    const pending = uploadItems.filter(
      (item) => item.status === 'pending' || item.status === 'failed',
    );
    if (pending.length === 0) return;
    if (phaseCancel && !nicheId) {
      toast.error('Selecione um nicho para usar o Phase Cancel.');
      return;
    }
    setIsUploading(true);
    setUploadItems((items) =>
      items.map((item) =>
        pending.some((candidate) => candidate.id === item.id)
          ? { ...item, status: 'pending', progress: 0, error: undefined }
          : item,
      ),
    );

    let cursor = 0;
    let succeeded = 0;
    const worker = async () => {
      while (cursor < pending.length) {
        const item = pending[cursor++];
        if (!item) return;
        setUploadItems((items) =>
          items.map((current) =>
            current.id === item.id ? { ...current, status: 'uploading', progress: 0 } : current,
          ),
        );
        try {
          await apiClient.createMediaJob(
            {
              file: item.file,
              compression,
              aspectRatio,
              stripMetadata,
              normalizeAudio,
              extensionMode,
              ...(extensionMode !== 'none' ? { targetSeconds } : {}),
              phaseCancel,
              ...(phaseCancel ? { nicheId, whiteVolumeDb, verifyTranscript } : {}),
            },
            (progress) =>
              setUploadItems((items) =>
                items.map((current) =>
                  current.id === item.id ? { ...current, progress } : current,
                ),
              ),
          );
          succeeded += 1;
          setUploadItems((items) =>
            items.map((current) =>
              current.id === item.id ? { ...current, status: 'done', progress: 100 } : current,
            ),
          );
        } catch (error) {
          setUploadItems((items) =>
            items.map((current) =>
              current.id === item.id
                ? {
                    ...current,
                    status: 'failed',
                    error: error instanceof Error ? error.message : 'Falha no envio.',
                  }
                : current,
            ),
          );
        }
      }
    };
    await Promise.all(
      Array.from({ length: Math.min(UPLOAD_CONCURRENCY, pending.length) }, () => worker()),
    );
    setIsUploading(false);
    await qc.invalidateQueries({ queryKey: ['media-jobs'] });
    if (succeeded === pending.length) {
      toast.success(`${succeeded} vídeo(s) enviado(s) para processamento.`);
    } else {
      toast.warning(`${succeeded} de ${pending.length} vídeo(s) enviados. Revise as falhas.`);
    }
  };

  const downloadSelected = async () => {
    if (selectedReadyJobs.length === 0) return;
    if (selectedBytes > MAX_BULK_BYTES) {
      toast.error('A seleção excede 3 GB. Divida o download em lotes menores.');
      return;
    }
    setIsDownloading(true);
    try {
      const result = await apiClient.bulkDownloadMediaJobs(selectedReadyJobs.map((job) => job.id));
      toast.success(`${selectedReadyJobs.length} vídeo(s) baixado(s) em ${result.filename}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao gerar o ZIP.');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="space-y-8">
      <section className="glass-card space-y-5 p-5">
        <label className="block cursor-pointer rounded-md border border-dashed border-cyan-300/25 bg-cyan-300/[0.03] p-7 text-center hover:bg-cyan-300/[0.06]">
          <Upload className="mx-auto mb-2 h-6 w-6 text-cyan-300" />
          <p className="text-sm font-semibold text-white">
            Selecionar vídeos para processamento em lote
          </p>
          <p className="mt-1 text-xs text-white/45">
            Até {MAX_BATCH_FILES} vídeos · MP4, MOV, AVI, WEBM, MKV ou M4V · 500 MB cada
          </p>
          <input
            className="sr-only"
            type="file"
            multiple
            accept="video/*,.mkv,.m4v"
            disabled={isUploading}
            onChange={(event) => {
              addFiles(event.target.files);
              event.target.value = '';
            }}
          />
        </label>

        {uploadItems.length > 0 && (
          <div className="space-y-2 rounded-xl border border-white/[0.08] bg-black/15 p-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-white/75">
                {uploadItems.length} vídeo(s) no lote
              </p>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={isUploading}
                onClick={() => setUploadItems([])}
              >
                Limpar lote
              </Button>
            </div>
            <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
              {uploadItems.map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-white/[0.07] bg-white/[0.025] p-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-cyan-300/[0.07] text-cyan-200">
                      {item.status === 'uploading' ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : item.status === 'done' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-300" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-white/85">{item.file.name}</p>
                      <p
                        className={`text-[10px] ${
                          item.status === 'failed' ? 'text-rose-300' : 'text-white/40'
                        }`}
                      >
                        {item.status === 'failed'
                          ? item.error
                          : `${formatBytes(item.file.size)} · ${
                              item.status === 'pending'
                                ? 'Aguardando'
                                : item.status === 'uploading'
                                  ? `Enviando ${item.progress}%`
                                  : 'Enviado'
                            }`}
                      </p>
                    </div>
                    {!isUploading && (
                      <button
                        type="button"
                        className="rounded-md p-1.5 text-white/35 hover:bg-white/[0.06] hover:text-white"
                        aria-label={`Remover ${item.file.name}`}
                        onClick={() =>
                          setUploadItems((items) =>
                            items.filter((current) => current.id !== item.id),
                          )
                        }
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                  {item.status === 'uploading' && (
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.07]">
                      <div
                        className="h-full rounded-full bg-cyan-300 transition-[width]"
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          <OptionField
            icon={Gauge}
            label="Compressão"
            description={
              compressionOptions.find((option) => option.value === compression)?.description
            }
          >
            <Select
              value={compression}
              onValueChange={(value) => setCompression(value as MediaCompressionMode)}
            >
              <SelectTrigger aria-label="Compressão do vídeo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {compressionOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </OptionField>
          <OptionField
            icon={Maximize2}
            label="Proporção"
            description={
              aspectRatioOptions.find((option) => option.value === aspectRatio)?.description
            }
          >
            <Select
              value={aspectRatio}
              onValueChange={(value) => setAspectRatio(value as MediaAspectRatio)}
            >
              <SelectTrigger aria-label="Proporção do vídeo">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {aspectRatioOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </OptionField>
          <OptionField
            icon={Repeat2}
            label="Extensão"
            description={
              extensionOptions.find((option) => option.value === extensionMode)?.description
            }
          >
            <Select
              value={extensionMode}
              onValueChange={(value) => setExtensionMode(value as MediaExtensionMode)}
            >
              <SelectTrigger aria-label="Extensão da duração">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {extensionOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </OptionField>
        </div>

        {extensionMode !== 'none' && (
          <Field
            label={extensionMode === 'loop' ? 'Duração total (segundos)' : 'Segundos adicionais'}
          >
            <input
              type="number"
              min={1}
              max={3600}
              value={targetSeconds}
              onChange={(e) => setTargetSeconds(Number(e.target.value))}
              className="input w-40"
            />
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleCard
            icon={ShieldCheck}
            title="Remover metadados"
            description="Limpa informações internas do arquivo"
            checked={stripMetadata}
            onChange={setStripMetadata}
          />
          <ToggleCard
            icon={AudioLines}
            title="Normalizar áudio"
            description="Equilibra o volume para reprodução"
            checked={normalizeAudio}
            onChange={setNormalizeAudio}
          />
        </div>

        <div
          className={`rounded-xl border p-4 transition-all ${phaseCancel ? 'border-cyan-300/30 bg-cyan-300/[0.045] shadow-[0_0_28px_rgba(34,211,238,0.06)]' : 'border-white/[0.08] bg-white/[0.025]'}`}
        >
          <label htmlFor="phase-cancel" className="flex cursor-pointer items-center gap-3">
            <span
              className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${phaseCancel ? 'bg-cyan-300/15 text-cyan-200' : 'bg-white/[0.04] text-white/50'}`}
            >
              <Shield className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2 text-sm font-semibold text-white">
                Ativar Phase Cancel{' '}
                <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-2 py-0.5 text-[9px] uppercase tracking-wider text-cyan-200">
                  Video Shield
                </span>
              </span>
              <span className="mt-0.5 block text-xs text-white/45">
                Cancela a voz original em mono e mistura um White Audio que permanece audível para
                bots.
              </span>
            </span>
            <Checkbox
              id="phase-cancel"
              checked={phaseCancel}
              onChange={(event) => setPhaseCancel(event.target.checked)}
            />
          </label>

          {phaseCancel && (
            <div className="mt-4 grid gap-4 border-t border-cyan-300/10 pt-4 md:grid-cols-2">
              <Field label="Nicho do White Audio">
                <Select value={nicheId} onValueChange={setNicheId}>
                  <SelectTrigger aria-label="Nicho do White Audio">
                    <SelectValue placeholder="Selecione um nicho" />
                  </SelectTrigger>
                  <SelectContent>
                    {niches
                      .filter((niche) => niche.whites.length > 0)
                      .map((niche) => (
                        <SelectItem key={niche.id} value={niche.id}>
                          {niche.name} · {niche.whites.length} áudio(s)
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={`Volume do White Audio · ${whiteVolumeDb} dB`}>
                <input
                  aria-label="Volume do White Audio"
                  type="range"
                  min={-40}
                  max={-5}
                  step={1}
                  value={whiteVolumeDb}
                  onChange={(event) => setWhiteVolumeDb(Number(event.target.value))}
                  className="h-11 w-full accent-cyan-300"
                />
              </Field>
              <div className="md:col-span-2">
                <ToggleCard
                  icon={BrainCircuit}
                  title="Verificar com AssemblyAI"
                  description="Transcreve o arquivo final para confirmar o comportamento do Phase Cancel"
                  checked={verifyTranscript}
                  onChange={setVerifyTranscript}
                />
              </div>
              {niches.filter((niche) => niche.whites.length > 0).length === 0 && (
                <p className="md:col-span-2 text-xs text-amber-200">
                  Cadastre um nicho com pelo menos um White Audio na seção abaixo.
                </p>
              )}
            </div>
          )}
        </div>

        <Button
          onClick={processBatch}
          disabled={
            uploadItems.every((item) => item.status !== 'pending' && item.status !== 'failed') ||
            isUploading ||
            (phaseCancel && !nicheId)
          }
        >
          {isUploading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {isUploading
            ? 'Enviando lote…'
            : `Processar ${
                uploadItems.filter((item) => item.status === 'pending' || item.status === 'failed')
                  .length
              } vídeo(s)`}
        </Button>
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="hud-label">Histórico recente</p>
            <p className="mt-1 text-xs text-white/40">
              Selecione os resultados prontos para baixar tudo em um arquivo ZIP.
            </p>
          </div>
          {readyJobs.length > 0 && (
            <label className="flex cursor-pointer items-center gap-2 text-xs text-white/60">
              <Checkbox
                checked={readyJobs.every((job) => selectedJobs.has(job.id))}
                onChange={(event) =>
                  setSelectedJobs(
                    event.target.checked ? new Set(readyJobs.map((job) => job.id)) : new Set(),
                  )
                }
              />
              Selecionar todos os prontos
            </label>
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
                onClick={downloadSelected}
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
              <a href={job.output.download_url}>
                <Button variant="outline">
                  <Download className="mr-2 h-4 w-4" />
                  Baixar
                </Button>
              </a>
            )}
            <Button
              variant="ghost"
              onClick={async () => {
                await apiClient.deleteMediaJob(job.id);
                qc.invalidateQueries({ queryKey: ['media-jobs'] });
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

      <details className="glass-card group p-5">
        <summary className="cursor-pointer list-none text-sm font-semibold text-white/80">
          Gerenciar nichos e White Audios{' '}
          <span className="ml-2 text-xs font-normal text-white/35">
            {niches.length} cadastrado(s)
          </span>
        </summary>
        <div className="mt-5 border-t border-white/[0.07] pt-5">
          <NicheManager niches={niches} isLoading={nichesLoading} />
        </div>
      </details>

      <details className="glass-card group p-5">
        <summary className="cursor-pointer list-none text-sm font-semibold text-white/80">
          Processamentos antigos do Video Shield
        </summary>
        <div className="mt-5 border-t border-white/[0.07] pt-5">
          <ShieldJobsHistory />
        </div>
      </details>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="hud-label block">{label}</span>
      {children}
    </div>
  );
}

function OptionField({
  icon: Icon,
  label,
  description,
  children,
}: { icon: typeof Gauge; label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="group rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 transition-all hover:border-cyan-300/20 hover:bg-cyan-300/[0.025] focus-within:border-cyan-300/30 focus-within:ring-2 focus-within:ring-cyan-300/[0.08]">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-300/10 bg-cyan-300/[0.06] text-cyan-300">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <span className="hud-label block">{label}</span>
          <p className="truncate text-[11px] text-white/40">{description}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function ToggleCard({
  icon: Icon,
  title,
  description,
  checked,
  onChange,
}: {
  icon: typeof ShieldCheck;
  title: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = `toggle-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <label
      htmlFor={id}
      className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 transition-all hover:border-cyan-300/20 hover:bg-cyan-300/[0.035]"
    >
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-white/55">
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-white/85">{title}</span>
        <span className="block text-xs text-white/40">{description}</span>
      </span>
      <Checkbox id={id} checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
