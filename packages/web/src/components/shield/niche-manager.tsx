'use client';

import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Trash2, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, type NicheView, type NicheWhiteView } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

export function NicheManager({
  niches,
  isLoading,
}: {
  niches: NicheView[];
  isLoading: boolean;
}) {
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const createMut = useMutation({
    mutationFn: () =>
      apiClient.createNiche({
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['niches'] });
      setName('');
      setDescription('');
      setShowCreate(false);
      toast.success('Nicho criado.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteNiche(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['niches'] });
      toast.success('Nicho removido.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const renameMut = useMutation({
    mutationFn: (args: { id: string; name: string }) =>
      apiClient.updateNiche(args.id, { name: args.name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['niches'] });
      setEditingId(null);
      toast.success('Nicho atualizado.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="hud-label">Seus nichos</p>
          <h2 className="mt-1 text-[16px] font-semibold text-white">
            {niches.length} nicho(s) cadastrado(s)
          </h2>
        </div>
        <Button
          size="sm"
          variant={showCreate ? 'outline' : 'default'}
          onClick={() => setShowCreate((v) => !v)}
        >
          <Plus className="h-3.5 w-3.5" />
          {showCreate ? 'Cancelar' : 'Novo nicho'}
        </Button>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return toast.error('Dê um nome.');
            createMut.mutate();
          }}
          className="glass-card space-y-3 p-4"
        >
          <div className="space-y-1">
            <Label className="hud-label">Nome</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Saúde, Finanças, Emagrecimento"
              disabled={createMut.isPending}
            />
          </div>
          <div className="space-y-1">
            <Label className="hud-label">Descrição (opcional)</Label>
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Notas internas"
              disabled={createMut.isPending}
            />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Criar
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="glass-card flex items-center justify-center p-8">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
        </div>
      ) : niches.length === 0 ? (
        <div className="glass-card p-8 text-center text-[13px] text-white/55">
          Nenhum nicho ainda. Crie um pra começar a cadastrar áudios white.
        </div>
      ) : (
        <div className="space-y-2">
          {niches.map((n) => {
            const open = openId === n.id;
            return (
              <div key={n.id} className="glass-card overflow-hidden p-0">
                <div className="flex items-center gap-2 p-4">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : n.id)}
                    className="flex flex-1 items-center gap-2 text-left"
                  >
                    {open ? (
                      <ChevronUp className="h-4 w-4 text-white/45" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-white/45" />
                    )}
                    {editingId === n.id ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-8 max-w-[260px]"
                      />
                    ) : (
                      <span className="text-[15px] font-semibold text-white">{n.name}</span>
                    )}
                    <span className="rounded-full border border-white/[0.10] bg-white/[0.04] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/55">
                      {n.whites.length} white(s)
                    </span>
                  </button>
                  {editingId === n.id ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() => renameMut.mutate({ id: n.id, name: editName })}
                        disabled={renameMut.isPending || !editName.trim()}
                      >
                        Salvar
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        Cancelar
                      </Button>
                    </>
                  ) : n.canModify ? (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(n.id);
                          setEditName(n.name);
                        }}
                        title="Renomear"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (
                            confirm(
                              `Remover nicho "${n.name}"? ${
                                n.whites.length > 0 ? `Os ${n.whites.length} áudio(s) também serão deletados.` : ''
                              }`,
                            )
                          )
                            deleteMut.mutate(n.id);
                        }}
                        title="Remover"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </>
                  ) : (
                    <span
                      className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30"
                      title="Apenas o criador ou admin podem modificar"
                    >
                      compartilhado
                    </span>
                  )}
                </div>
                {open && (
                  <div className="border-t border-white/[0.06] bg-black/15 p-4">
                    {n.description && (
                      <p className="mb-3 text-[12px] text-white/55">{n.description}</p>
                    )}
                    <NicheWhitesList niche={n} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function NicheWhitesList({ niche }: { niche: NicheView }) {
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
      qc.invalidateQueries({ queryKey: ['niches'] });
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
      qc.invalidateQueries({ queryKey: ['niches'] });
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
            <p className="text-[10px] text-white/40 md:pb-2">
              Até 20MB · mp3, wav, m4a, ogg
            </p>
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
          Esse nicho foi criado por outro membro. Você pode usá-lo no processamento,
          mas só o criador (ou um admin) pode adicionar/remover áudios.
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

function WhiteRow({
  white,
  canModify,
  onRemove,
}: {
  white: NicheWhiteView;
  canModify: boolean;
  onRemove: () => void;
}) {
  return (
    <li className="flex items-center gap-2 rounded-md border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-[12px]">
      <Upload className="h-3 w-3 shrink-0 text-cyan-300/70" />
      <span className="flex-1 truncate text-white/85" title={white.filename}>
        {white.label || white.filename}
      </span>
      <span className="shrink-0 font-mono text-[10px] text-white/40">
        {formatBytes(white.bytes)}
      </span>
      {canModify && (
        <button
          type="button"
          onClick={() => {
            if (confirm(`Remover áudio "${white.label || white.filename}"?`)) onRemove();
          }}
          className="text-white/40 hover:text-rose-300"
          title="Remover"
        >
          <Trash2 className="h-3 w-3" />
        </button>
      )}
    </li>
  );
}
