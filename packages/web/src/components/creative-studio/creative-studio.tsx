'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AudioLines, Download, Gauge, Loader2, Maximize2, Repeat2, ShieldCheck, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  apiClient,
  type MediaAspectRatio,
  type MediaCompressionMode,
  type MediaExtensionMode,
} from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

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

export function CreativeStudio() {
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [compression, setCompression] = useState<MediaCompressionMode>('balanced');
  const [aspectRatio, setAspectRatio] = useState<MediaAspectRatio>('original');
  const [stripMetadata, setStripMetadata] = useState(true);
  const [normalizeAudio, setNormalizeAudio] = useState(true);
  const [extensionMode, setExtensionMode] = useState<MediaExtensionMode>('none');
  const [targetSeconds, setTargetSeconds] = useState(30);
  const [progress, setProgress] = useState(0);

  const jobs = useQuery({
    queryKey: ['media-jobs'],
    queryFn: () => apiClient.listMediaJobs(),
    refetchInterval: (query) =>
      query.state.data?.some((job) => job.status === 'queued' || job.status === 'processing')
        ? 2_000
        : false,
  });

  const create = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('Selecione um vídeo.');
      return apiClient.createMediaJob({
        file, compression, aspectRatio, stripMetadata, normalizeAudio,
        extensionMode,
        ...(extensionMode !== 'none' ? { targetSeconds } : {}),
      }, setProgress);
    },
    onSuccess: () => {
      toast.success('Vídeo enviado para processamento.');
      setFile(null); setProgress(0); qc.invalidateQueries({ queryKey: ['media-jobs'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Falha no envio.'),
  });

  return (
    <div className="space-y-8">
      <section className="glass-card space-y-5 p-5">
        <label className="block cursor-pointer rounded-md border border-dashed border-cyan-300/25 bg-cyan-300/[0.03] p-7 text-center hover:bg-cyan-300/[0.06]">
          <Upload className="mx-auto mb-2 h-6 w-6 text-cyan-300" />
          <p className="text-sm font-semibold text-white">{file?.name ?? 'Selecionar vídeo'}</p>
          <p className="mt-1 text-xs text-white/45">MP4, MOV, AVI, WEBM, MKV ou M4V · até 500 MB</p>
          <input className="sr-only" type="file" accept="video/*,.mkv,.m4v" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>

        <div className="grid gap-4 md:grid-cols-3">
          <OptionField icon={Gauge} label="Compressão" description={compressionOptions.find((option) => option.value === compression)?.description}>
            <Select value={compression} onValueChange={(value) => setCompression(value as MediaCompressionMode)}>
              <SelectTrigger aria-label="Compressão do vídeo"><SelectValue /></SelectTrigger>
              <SelectContent>{compressionOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </OptionField>
          <OptionField icon={Maximize2} label="Proporção" description={aspectRatioOptions.find((option) => option.value === aspectRatio)?.description}>
            <Select value={aspectRatio} onValueChange={(value) => setAspectRatio(value as MediaAspectRatio)}>
              <SelectTrigger aria-label="Proporção do vídeo"><SelectValue /></SelectTrigger>
              <SelectContent>{aspectRatioOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </OptionField>
          <OptionField icon={Repeat2} label="Extensão" description={extensionOptions.find((option) => option.value === extensionMode)?.description}>
            <Select value={extensionMode} onValueChange={(value) => setExtensionMode(value as MediaExtensionMode)}>
              <SelectTrigger aria-label="Extensão da duração"><SelectValue /></SelectTrigger>
              <SelectContent>{extensionOptions.map((option) => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
            </Select>
          </OptionField>
        </div>

        {extensionMode !== 'none' && (
          <Field label={extensionMode === 'loop' ? 'Duração total (segundos)' : 'Segundos adicionais'}>
            <input type="number" min={1} max={3600} value={targetSeconds} onChange={(e) => setTargetSeconds(Number(e.target.value))} className="input w-40" />
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <ToggleCard icon={ShieldCheck} title="Remover metadados" description="Limpa informações internas do arquivo" checked={stripMetadata} onChange={setStripMetadata} />
          <ToggleCard icon={AudioLines} title="Normalizar áudio" description="Equilibra o volume para reprodução" checked={normalizeAudio} onChange={setNormalizeAudio} />
        </div>

        <Button onClick={() => create.mutate()} disabled={!file || create.isPending}>
          {create.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          {create.isPending ? `Enviando ${progress}%` : 'Processar vídeo'}
        </Button>
      </section>

      <section className="space-y-3">
        <p className="hud-label">Histórico recente</p>
        {(jobs.data ?? []).map((job) => (
          <div key={job.id} className="glass-card flex flex-wrap items-center gap-3 p-4">
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{job.input.filename}</p><p className="text-xs uppercase tracking-wider text-white/40">{job.status}</p></div>
            {job.output?.download_url && <a href={job.output.download_url}><Button variant="outline"><Download className="mr-2 h-4 w-4" />Baixar</Button></a>}
            <Button variant="ghost" onClick={async () => { await apiClient.deleteMediaJob(job.id); qc.invalidateQueries({ queryKey: ['media-jobs'] }); }}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        {!jobs.isLoading && (jobs.data?.length ?? 0) === 0 && <p className="text-sm text-white/40">Nenhum processamento ainda.</p>}
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-2"><span className="hud-label block">{label}</span>{children}</label>;
}

function OptionField({ icon: Icon, label, description, children }: { icon: typeof Gauge; label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="group rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 transition-all hover:border-cyan-300/20 hover:bg-cyan-300/[0.025] focus-within:border-cyan-300/30 focus-within:ring-2 focus-within:ring-cyan-300/[0.08]">
      <div className="mb-3 flex items-center gap-2.5">
        <span className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-300/10 bg-cyan-300/[0.06] text-cyan-300"><Icon className="h-4 w-4" /></span>
        <div className="min-w-0"><span className="hud-label block">{label}</span><p className="truncate text-[11px] text-white/40">{description}</p></div>
      </div>
      {children}
    </div>
  );
}

function ToggleCard({ icon: Icon, title, description, checked, onChange }: { icon: typeof ShieldCheck; title: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] p-3.5 transition-all hover:border-cyan-300/20 hover:bg-cyan-300/[0.035]">
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-white/55"><Icon className="h-4 w-4" /></span>
      <span className="min-w-0 flex-1"><span className="block text-sm font-medium text-white/85">{title}</span><span className="block text-xs text-white/40">{description}</span></span>
      <Checkbox checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}
