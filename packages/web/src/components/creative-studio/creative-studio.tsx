'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Loader2, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import {
  apiClient,
  type MediaAspectRatio,
  type MediaCompressionMode,
  type MediaExtensionMode,
} from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';

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
          <Field label="Compressão">
            <select value={compression} onChange={(e) => setCompression(e.target.value as MediaCompressionMode)} className="input w-full">
              <option value="none">Qualidade máxima</option><option value="balanced">Equilibrada</option><option value="small">Arquivo menor</option>
            </select>
          </Field>
          <Field label="Proporção">
            <select value={aspectRatio} onChange={(e) => setAspectRatio(e.target.value as MediaAspectRatio)} className="input w-full">
              <option value="original">Original</option><option value="9:16">9:16 Stories/Reels</option><option value="4:5">4:5 Feed</option><option value="1:1">1:1 Quadrado</option>
            </select>
          </Field>
          <Field label="Extensão">
            <select value={extensionMode} onChange={(e) => setExtensionMode(e.target.value as MediaExtensionMode)} className="input w-full">
              <option value="none">Não estender</option><option value="loop">Loop até a duração</option><option value="freeze">Congelar frame final</option>
            </select>
          </Field>
        </div>

        {extensionMode !== 'none' && (
          <Field label={extensionMode === 'loop' ? 'Duração total (segundos)' : 'Segundos adicionais'}>
            <input type="number" min={1} max={3600} value={targetSeconds} onChange={(e) => setTargetSeconds(Number(e.target.value))} className="input w-40" />
          </Field>
        )}

        <div className="flex flex-wrap gap-5 text-sm text-white/70">
          <label className="flex items-center gap-2"><Checkbox checked={stripMetadata} onChange={(e) => setStripMetadata(e.target.checked)} /> Remover metadados</label>
          <label className="flex items-center gap-2"><Checkbox checked={normalizeAudio} onChange={(e) => setNormalizeAudio(e.target.checked)} /> Normalizar áudio</label>
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
