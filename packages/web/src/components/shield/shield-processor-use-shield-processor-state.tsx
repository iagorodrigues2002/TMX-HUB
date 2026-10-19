'use client';

import { type NicheView, type ShieldCompressionMode, apiClient } from '@/lib/api-client';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ALLOWED_MEDIA_EXT,
  PARALLEL_UPLOADS,
  type UploadSlot,
  extOf,
  isZipFile,
  newSlotId,
} from './shield-processor-support';

export function useShieldProcessorState({ niches }: { niches: NicheView[] }) {
  const qc = useQueryClient();
  const [slots, setSlots] = useState<UploadSlot[]>([]);
  const [nicheId, setNicheId] = useState<string>('');
  const [useWhiteAudio, setUseWhiteAudio] = useState(true);
  const [whiteVolumeDb, setWhiteVolumeDb] = useState(-22);
  const [compression, setCompression] = useState<ShieldCompressionMode>('none');
  const [verifyTranscript, setVerifyTranscript] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [extractingZips, setExtractingZips] = useState(0);
  const [draggingOver, setDraggingOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Bloqueia o browser de "abrir" arquivos que caem fora do drop zone
  // (default action seria navegar pro arquivo). Mantém a janela inteira como
  // capture pra não perder o evento.
  useEffect(() => {
    const onWindowDragOver = (e: DragEvent) => {
      if (e.dataTransfer && Array.from(e.dataTransfer.types).includes('Files')) {
        e.preventDefault();
      }
    };
    const onWindowDrop = (e: DragEvent) => {
      // Só previne se não é dentro do drop zone (ele já preventDefault dele).
      if (
        e.dataTransfer &&
        Array.from(e.dataTransfer.types).includes('Files') &&
        !(e.target as HTMLElement)?.closest?.('[data-shield-dropzone]')
      ) {
        e.preventDefault();
      }
    };
    window.addEventListener('dragover', onWindowDragOver);
    window.addEventListener('drop', onWindowDrop);
    return () => {
      window.removeEventListener('dragover', onWindowDragOver);
      window.removeEventListener('drop', onWindowDrop);
    };
  }, []);

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

  const onAddFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    // CRÍTICO: copia os Files ANTES de mexer no input. fileList é a referência
    // viva de input.files; reset do input.value zera essa coleção, então leitura
    // depois do reset retornaria []. Array.from copia as referências dos File
    // pra um array novo que sobrevive ao reset.
    const incoming = Array.from(fileList);
    if (fileRef.current) fileRef.current.value = '';

    const zipFiles: File[] = [];
    const mediaFiles: File[] = [];
    const rejected: { name: string; reason: string }[] = [];

    for (const f of incoming) {
      if (isZipFile(f)) {
        zipFiles.push(f);
        continue;
      }
      const ext = extOf(f.name);
      const mime = (f.type || '').toLowerCase();
      const isMediaByMime = mime.startsWith('video/') || mime.startsWith('audio/');
      const isMediaByExt = ALLOWED_MEDIA_EXT.has(ext);
      if (isMediaByMime || isMediaByExt) {
        mediaFiles.push(f);
      } else {
        rejected.push({
          name: f.name,
          reason: `tipo "${mime || ext || 'desconhecido'}" não suportado`,
        });
      }
    }

    for (const r of rejected) {
      toast.warning(`Ignorado: ${r.name} — ${r.reason}`);
    }

    if (mediaFiles.length > 0) {
      const adds: UploadSlot[] = mediaFiles.map((f) => ({
        id: newSlotId(),
        file: f,
        status: 'pending',
        progress: 0,
      }));
      setSlots((s) => [...s, ...adds]);
      toast.info(
        `${mediaFiles.length} arquivo(s) adicionado(s)${
          zipFiles.length > 0 ? ' · extraindo ZIP(s)…' : ''
        }`,
      );
    }

    if (zipFiles.length === 0) return;

    setExtractingZips((n) => n + zipFiles.length);
    try {
      const { default: JSZip } = await import('jszip');
      const results = await Promise.allSettled(
        zipFiles.map(async (zip) => {
          try {
            const buf = await zip.arrayBuffer();
            const z = await JSZip.loadAsync(buf);
            const out: File[] = [];
            for (const entry of Object.values(z.files)) {
              if (entry.dir) continue;
              if (entry.name.startsWith('__MACOSX/')) continue;
              const baseName = entry.name.split('/').pop() || entry.name;
              if (!baseName || baseName.startsWith('.')) continue;
              const ext = extOf(baseName);
              if (!ALLOWED_MEDIA_EXT.has(ext)) continue;
              const blob = await entry.async('blob');
              const mime =
                ext === 'mp4' || ext === 'm4a'
                  ? 'video/mp4'
                  : ext === 'mov'
                    ? 'video/quicktime'
                    : ext === 'avi'
                      ? 'video/x-msvideo'
                      : ext === 'webm'
                        ? 'video/webm'
                        : ext === 'mkv'
                          ? 'video/x-matroska'
                          : ext === 'mp3'
                            ? 'audio/mpeg'
                            : ext === 'wav'
                              ? 'audio/wav'
                              : ext === 'aac'
                                ? 'audio/aac'
                                : 'application/octet-stream';
              out.push(new File([blob], baseName, { type: mime }));
            }
            if (out.length === 0) {
              toast.warning(`${zip.name}: ZIP aberto mas sem vídeos/áudios reconhecidos.`);
            } else {
              toast.success(`${zip.name}: ${out.length} mídia(s) extraídas.`);
            }
            return out;
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            console.error('[shield] erro ao extrair ZIP', zip.name, err);
            toast.error(`${zip.name}: erro ao abrir ZIP — ${msg}`);
            throw err;
          }
        }),
      );
      const flat: File[] = [];
      for (const r of results) {
        if (r.status === 'fulfilled') flat.push(...r.value);
      }
      if (flat.length > 0) {
        const adds: UploadSlot[] = flat.map((f) => ({
          id: newSlotId(),
          file: f,
          status: 'pending',
          progress: 0,
        }));
        setSlots((s) => [...s, ...adds]);
      }
    } catch (error) {
      toast.error(`Não foi possível extrair os arquivos ZIP: ${(error as Error).message}`);
    } finally {
      setExtractingZips((n) => Math.max(0, n - zipFiles.length));
    }
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
          ...(useWhiteAudio ? { nicheId } : {}),
          useWhiteAudio,
          whiteVolumeDb,
          compression,
          verifyTranscript,
        },
        (pct) => {
          setSlots((s) => s.map((x) => (x.id === slot.id ? { ...x, progress: pct } : x)));
        },
      );
      setSlots((s) =>
        s.map((x) =>
          x.id === slot.id ? { ...x, status: 'done', progress: 100, jobId: job.id } : x,
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
    if (useWhiteAudio && !nicheId) {
      toast.error('Selecione um nicho.');
      return;
    }
    if (useWhiteAudio && (!selectedNiche || selectedNiche.whites.length === 0)) {
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
      void qc.invalidateQueries({ queryKey: ['shield-jobs-list'] });
      toast.success('Uploads concluídos.');
    } finally {
      setSubmitting(false);
    }
  };
  return {
    niches,
    slots,
    nicheId,
    setNicheId,
    useWhiteAudio,
    setUseWhiteAudio,
    whiteVolumeDb,
    setWhiteVolumeDb,
    compression,
    setCompression,
    verifyTranscript,
    setVerifyTranscript,
    submitting,
    extractingZips,
    draggingOver,
    setDraggingOver,
    fileRef,
    selectedNiche,
    pendingCount,
    uploadingCount,
    doneCount,
    failedCount,
    activeJobIds,
    onAddFiles,
    removeSlot,
    clearAll,
    onSubmit,
  };
}
