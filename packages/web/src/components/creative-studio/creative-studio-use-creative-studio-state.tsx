'use client';

import {
  type MediaAspectRatio,
  type MediaCompressionMode,
  type MediaExtensionMode,
  type NicheView,
  apiClient,
} from '@/lib/api-client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  MAX_BATCH_FILES,
  MAX_BULK_BYTES,
  MAX_FILE_BYTES,
  UPLOAD_CONCURRENCY,
  type UploadItem,
} from './creative-studio-support';

export function useCreativeStudioState({
  niches,
  nichesLoading,
}: { niches: NicheView[]; nichesLoading: boolean }) {
  const qc = useQueryClient();
  const [uploadItems, setUploadItems] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedJobs, setSelectedJobs] = useState<Set<string>>(new Set());
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadingJobId, setDownloadingJobId] = useState<string | null>(null);
  const [compression, setCompression] = useState<MediaCompressionMode>('balanced');
  const [aspectRatio, setAspectRatio] = useState<MediaAspectRatio>('original');
  const [stripMetadata, setStripMetadata] = useState(true);
  const [normalizeAudio, setNormalizeAudio] = useState(true);
  const [extensionMode, setExtensionMode] = useState<MediaExtensionMode>('none');
  const [targetSeconds, setTargetSeconds] = useState(30);
  const [phaseCancel, setPhaseCancel] = useState(false);
  const [useWhiteAudio, setUseWhiteAudio] = useState(true);
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
    if (phaseCancel && useWhiteAudio && !nicheId) {
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
              useWhiteAudio,
              ...(phaseCancel
                ? {
                    ...(useWhiteAudio ? { nicheId, whiteVolumeDb } : {}),
                    verifyTranscript,
                  }
                : {}),
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

  const downloadJob = async (id: string) => {
    setDownloadingJobId(id);
    try {
      await apiClient.downloadMediaJob(id);
      toast.success('Download iniciado.');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Falha ao baixar o vídeo.');
    } finally {
      setDownloadingJobId(null);
    }
  };
  return {
    niches,
    nichesLoading,
    qc,
    uploadItems,
    setUploadItems,
    isUploading,
    selectedJobs,
    setSelectedJobs,
    isDownloading,
    downloadingJobId,
    compression,
    setCompression,
    aspectRatio,
    setAspectRatio,
    stripMetadata,
    setStripMetadata,
    normalizeAudio,
    setNormalizeAudio,
    extensionMode,
    setExtensionMode,
    targetSeconds,
    setTargetSeconds,
    phaseCancel,
    setPhaseCancel,
    useWhiteAudio,
    setUseWhiteAudio,
    nicheId,
    setNicheId,
    whiteVolumeDb,
    setWhiteVolumeDb,
    verifyTranscript,
    setVerifyTranscript,
    jobs,
    readyJobs,
    selectedReadyJobs,
    selectedBytes,
    addFiles,
    processBatch,
    downloadSelected,
    downloadJob,
  };
}
