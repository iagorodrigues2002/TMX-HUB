'use client';

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
import type { NicheView, ShieldCompressionMode } from '@/lib/api-client';
import { AlertTriangle, FileArchive, Loader2, Shuffle, Upload } from 'lucide-react';
import { ShieldJobStatus } from './shield-processor-shield-job-status';
import { SlotRow } from './shield-processor-slot-row';
import { COMPRESSION_OPTIONS } from './shield-processor-support';
import { useShieldProcessorState } from './shield-processor-use-shield-processor-state';

/**
 * @deprecated Legado sem imports vivos, confirmado em 2026-10-06.
 * Use `@/components/creative-studio/creative-studio`.
 */
export function ShieldProcessor({ niches }: { niches: NicheView[] }) {
  const {
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
  } = useShieldProcessorState({ niches });

  return (
    <div className="space-y-4">
      <div>
        <p className="hud-label">Processar vídeos</p>
        <h2 className="mt-1 text-[16px] font-semibold text-white">
          Phase Cancel {useWhiteAudio ? '+ White' : 'sem White'} (envio em massa)
        </h2>
      </div>

      <div className="glass-card space-y-5 p-5">
        {/* File picker — multi */}
        <div className="space-y-2">
          <Label className="hud-label">
            Vídeos ({slots.length} selecionado{slots.length === 1 ? '' : 's'})
          </Label>
          {/*
            <label> envolvendo o <input> garante que clicar em qualquer parte
            do drop zone abre o picker — sem depender de JS / refs.
            data-shield-dropzone é o marker que o handler global checa.
          */}
          <label
            data-shield-dropzone
            className={`block cursor-pointer rounded-md border border-dashed p-6 text-center transition-colors ${
              draggingOver
                ? 'border-cyan-300/60 bg-cyan-300/[0.06]'
                : 'border-white/[0.12] bg-white/[0.02] hover:bg-white/[0.04]'
            }`}
            onDragEnter={(e) => {
              e.preventDefault();
              setDraggingOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'copy';
            }}
            onDragLeave={(e) => {
              // Só remove se realmente saiu do label (não filho)
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              if (
                e.clientX <= rect.left ||
                e.clientX >= rect.right ||
                e.clientY <= rect.top ||
                e.clientY >= rect.bottom
              ) {
                setDraggingOver(false);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setDraggingOver(false);
              void onAddFiles(e.dataTransfer.files);
            }}
          >
            {extractingZips > 0 ? (
              <Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-cyan-300/70" />
            ) : (
              <Upload className="mx-auto mb-2 h-5 w-5 text-cyan-300/70" />
            )}
            <p className="text-[13px] font-semibold text-white">
              {extractingZips > 0
                ? `Extraindo ${extractingZips} ZIP(s)…`
                : draggingOver
                  ? 'Solte aqui'
                  : 'Clique pra selecionar ou arraste arquivos'}
            </p>
            <p className="mt-1 text-[11px] text-white/55">
              Múltipla seleção · MP4/MOV/AVI/WEBM/MKV · até 500MB cada
            </p>
            <p className="mt-0.5 text-[11px] text-cyan-300/70">
              <FileArchive className="mr-1 inline h-3 w-3" />
              ZIPs com vídeos dentro são extraídos automaticamente
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="video/*,audio/*,.zip,application/zip,application/x-zip-compressed"
              multiple
              className="sr-only"
              onChange={(e) => void onAddFiles(e.target.files)}
              disabled={submitting}
            />
          </label>

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

        <div className="space-y-2">
          <Label className="hud-label">Modo do áudio</Label>
          <Select
            value={useWhiteAudio ? 'white' : 'inversion-only'}
            onValueChange={(value) => setUseWhiteAudio(value === 'white')}
            disabled={submitting}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="white">Inversão + áudio white</SelectItem>
              <SelectItem value="inversion-only">Somente inversão · sem áudio white</SelectItem>
            </SelectContent>
          </Select>
          {!useWhiteAudio && (
            <p className="text-[11px] text-cyan-300/70">
              Nenhuma faixa adicional será criada ou misturada. O resultado terá apenas a inversão
              de fase.
            </p>
          )}
        </div>

        {useWhiteAudio && (
          <>
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
                  Esse nicho ainda não tem áudios. Adicione pelo menos 1 na seção{' '}
                  <strong>Nichos</strong>.
                </p>
              )}
              {selectedNiche && selectedNiche.whites.length > 0 && slots.length > 1 && (
                <p className="text-[11px] text-white/40">
                  <Shuffle className="mr-1 inline h-3 w-3 text-cyan-300/70" />
                  Cada vídeo do batch sorteia 1 dos {selectedNiche.whites.length} áudios
                  independentemente.
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
          </>
        )}

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
        <label
          htmlFor="shield-verify-transcript"
          className="flex items-start gap-3 text-[13px] text-white/75"
        >
          <Checkbox
            id="shield-verify-transcript"
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
            onClick={() => void onSubmit()}
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
