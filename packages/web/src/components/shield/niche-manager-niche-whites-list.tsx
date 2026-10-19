'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type NicheView, apiClient } from '@/lib/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { WhiteRow } from './niche-manager-support';

export function NicheWhitesList({ niche }: { niche: NicheView }) {
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [label, setLabel] = useState('');
  const [progress, setProgress] = useState<number | null>(null);

  const uploadMut = useMutation({
    mutationFn: async (file: File) => {
      setProgress(0);
      const result = await apiClient.addNicheWhite(
        niche.id,
        file,
        label.trim() || undefined,
        (pct) => setProgress(pct),
      );
      return result;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['niches'] });
      setLabel('');
      setProgress(null);
      if (fileRef.current) fileRef.current.value = '';
      toast.success('Áudio white adicionado.');
    },
    onError: (err) => {
      setProgress(null);
      toast.error((err as Error).message);
    },
  });

  const removeMut = useMutation({
    mutationFn: (whiteId: string) => apiClient.deleteNicheWhite(niche.id, whiteId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['niches'] });
      toast.success('Áudio removido.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="space-y-3">
      {/* Upload form — só pra quem pode modificar */}
      {niche.canModify ? (
        <div className="rounded-md border border-dashed border-white/[0.12] bg-white/[0.02] p-3">
          <div className="grid gap-2 md:grid-cols-[1fr_180px_auto] md:items-end">
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-[0.14em] text-white/45">
                Arquivo de áudio
              </Label>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*"
                disabled={uploadMut.isPending}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) uploadMut.mutate(f);
                }}
                className="block w-full text-[12px] text-white/75 file:mr-3 file:rounded file:border-0 file:bg-cyan-300/15 file:px-3 file:py-1 file:text-[11px] file:font-semibold file:uppercase file:tracking-[0.14em] file:text-cyan-200 hover:file:bg-cyan-300/25"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[10px] uppercase tracking-[0.14em] text-white/45">
                Label (opcional)
              </Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder='ex. "Hábitos saudáveis"'
                className="h-9"
                disabled={uploadMut.isPending}
              />
            </div>
            <p className="text-[10px] text-white/40 md:pb-2">Até 20MB · mp3, wav, m4a, ogg</p>
          </div>
          {progress !== null && (
            <div className="mt-2">
              <div className="h-1 overflow-hidden rounded-full bg-white/[0.08]">
                <div
                  className="h-full bg-cyan-300/70 transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <p className="mt-1 text-[10px] text-white/50">Enviando… {progress}%</p>
            </div>
          )}
        </div>
      ) : (
        <p className="rounded-md border border-white/[0.06] bg-black/15 px-3 py-2 text-[11px] text-white/45">
          Esse nicho foi criado por outro membro. Você pode usá-lo no processamento, mas só o
          criador (ou um admin) pode adicionar/remover áudios.
        </p>
      )}

      {/* List of whites */}
      {niche.whites.length === 0 ? (
        <p className="rounded-md border border-dashed border-white/[0.08] bg-white/[0.01] p-4 text-center text-[12px] text-white/40">
          Nenhum áudio white. Suba pelo menos 1 pra poder processar vídeos com esse nicho.
        </p>
      ) : (
        <ul className="space-y-1">
          {niche.whites.map((w) => (
            <WhiteRow
              key={w.id}
              white={w}
              canModify={niche.canModify}
              onRemove={() => removeMut.mutate(w.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
