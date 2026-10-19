'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type NicheView, apiClient } from '@/lib/api-client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, ChevronUp, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { NicheWhitesList } from './niche-manager-niche-whites-list';

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
      void qc.invalidateQueries({ queryKey: ['niches'] });
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
      void qc.invalidateQueries({ queryKey: ['niches'] });
      toast.success('Nicho removido.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const renameMut = useMutation({
    mutationFn: (args: { id: string; name: string }) =>
      apiClient.updateNiche(args.id, { name: args.name }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['niches'] });
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
                                n.whites.length > 0
                                  ? `Os ${n.whites.length} áudio(s) também serão deletados.`
                                  : ''
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
