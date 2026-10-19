'use client';

import { NicheManager } from '@/components/shield/niche-manager';
import { ShieldJobsHistory } from '@/components/shield/shield-jobs-history';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type {
  MediaAspectRatio,
  MediaCompressionMode,
  MediaExtensionMode,
  NicheView,
} from '@/lib/api-client';
import { AudioLines, Gauge, Loader2, Maximize2, Repeat2, ShieldCheck, Upload } from 'lucide-react';
import { renderPhaseCancelSettings } from './creative-studio-render-phase-cancel-settings';
import { renderRecentJobs } from './creative-studio-render-recent-jobs';
import {
  Field,
  MAX_BATCH_FILES,
  OptionField,
  ToggleCard,
  aspectRatioOptions,
  compressionOptions,
  extensionOptions,
} from './creative-studio-support';
import { useCreativeStudioState } from './creative-studio-use-creative-studio-state';

export function CreativeStudio({
  niches,
  nichesLoading,
}: { niches: NicheView[]; nichesLoading: boolean }) {
  const {
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
  } = useCreativeStudioState({ niches, nichesLoading });

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

        {uploadItems.length > 0 && renderUploadQueue({ uploadItems, setUploadItems, isUploading })}

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

        {renderPhaseCancelSettings({
          niches,
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
        })}

        <Button
          onClick={() => void processBatch()}
          disabled={
            uploadItems.every((item) => item.status !== 'pending' && item.status !== 'failed') ||
            isUploading ||
            (phaseCancel && useWhiteAudio && !nicheId)
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

      {renderRecentJobs({
        qc,
        selectedJobs,
        setSelectedJobs,
        isDownloading,
        downloadingJobId,
        jobs,
        readyJobs,
        selectedReadyJobs,
        selectedBytes,
        downloadSelected,
        downloadJob,
      })}

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

import { renderUploadQueue } from './creative-studio-render-upload-queue';
