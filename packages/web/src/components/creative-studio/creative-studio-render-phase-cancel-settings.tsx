'use client';

import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { BrainCircuit, Shield } from 'lucide-react';
import { Field, ToggleCard } from './creative-studio-support';
import type { useCreativeStudioState } from './creative-studio-use-creative-studio-state';

export function renderPhaseCancelSettings({
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
}: Pick<
  ReturnType<typeof useCreativeStudioState>,
  | 'niches'
  | 'phaseCancel'
  | 'setPhaseCancel'
  | 'useWhiteAudio'
  | 'setUseWhiteAudio'
  | 'nicheId'
  | 'setNicheId'
  | 'whiteVolumeDb'
  | 'setWhiteVolumeDb'
  | 'verifyTranscript'
  | 'setVerifyTranscript'
>) {
  return (
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
            Cancela a voz original em mono e mistura um White Audio que permanece audível para bots.
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
          <div className="md:col-span-2">
            <Field label="Modo do áudio">
              <Select
                value={useWhiteAudio ? 'white' : 'inversion-only'}
                onValueChange={(value) => setUseWhiteAudio(value === 'white')}
              >
                <SelectTrigger aria-label="Modo do áudio">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="white">Inversão + áudio white</SelectItem>
                  <SelectItem value="inversion-only">Somente inversão · sem áudio white</SelectItem>
                </SelectContent>
              </Select>
            </Field>
            {!useWhiteAudio && (
              <p className="mt-2 text-xs text-cyan-200/70">
                Nenhuma faixa adicional será adicionada. O vídeo manterá somente a inversão de fase.
              </p>
            )}
          </div>
          {useWhiteAudio && (
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
          )}
          {useWhiteAudio && (
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
          )}
          <div className="md:col-span-2">
            <ToggleCard
              icon={BrainCircuit}
              title="Verificar com AssemblyAI"
              description="Transcreve o arquivo final para confirmar o comportamento do Phase Cancel"
              checked={verifyTranscript}
              onChange={setVerifyTranscript}
            />
          </div>
          {useWhiteAudio && niches.filter((niche) => niche.whites.length > 0).length === 0 && (
            <p className="md:col-span-2 text-xs text-amber-200">
              Cadastre um nicho com pelo menos um White Audio na seção abaixo.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
