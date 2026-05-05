'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, type OfferView } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { OfferCard } from './offer-card';
import { OfferEditDialog } from './offer-edit-dialog';

export function OfferList() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<OfferView[]>({
    queryKey: ['offers'],
    queryFn: () => apiClient.listOffers(),
  });
  const offers = data ?? [];

  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [dashboardId, setDashboardId] = useState('');
  const [editing, setEditing] = useState<OfferView | null>(null);

  const createMut = useMutation({
    mutationFn: () =>
      apiClient.createOffer({
        name: name.trim(),
        ...(dashboardId.trim() ? { dashboard_id: dashboardId.trim() } : {}),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setShowCreate(false);
      setName('');
      setDashboardId('');
      toast.success('Oferta criada.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteOffer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      toast.success('Oferta removida.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="hud-label">Suas ofertas</p>
          <h2 className="mt-1 text-[16px] font-semibold text-white">
            {offers.length} ofertas cadastradas
          </h2>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate((v) => !v)}
          variant={showCreate ? 'outline' : 'default'}
        >
          <Plus className="h-3.5 w-3.5" />
          {showCreate ? 'Cancelar' : 'Nova oferta'}
        </Button>
      </div>

      {showCreate && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) {
              toast.error('Dê um nome.');
              return;
            }
            createMut.mutate();
          }}
          className="glass-card space-y-3 p-4"
        >
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1">
              <Label className="hud-label">Nome (ex: PFL_ENG)</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Nome curto da oferta"
                disabled={createMut.isPending}
              />
            </div>
            <div className="space-y-1">
              <Label className="hud-label">UTMify dashboardId (opcional)</Label>
              <Input
                value={dashboardId}
                onChange={(e) => setDashboardId(e.target.value)}
                placeholder="69f3b5692659d80c33debea2"
                disabled={createMut.isPending}
                className="font-mono text-[12px]"
              />
            </div>
          </div>
          <p className="text-[11px] text-white/40">
            Após criar, clique no ícone de lápis pra adicionar links (Front / Upsell, com
            páginas White e Black) e definir o status.
          </p>
          <div className="flex justify-end">
            <Button type="submit" disabled={createMut.isPending}>
              {createMut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              Criar
            </Button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="glass-card flex items-center justify-center p-12">
          <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
        </div>
      ) : offers.length === 0 ? (
        <div className="glass-card p-12 text-center">
          <p className="text-[13px] text-white/55">
            Você ainda não tem nenhuma oferta cadastrada. Crie a primeira pra centralizar
            os links e métricas.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {offers.map((o) => (
            <OfferCard
              key={o.id}
              offer={o}
              onEdit={() => setEditing(o)}
              onDelete={() => deleteMut.mutate(o.id)}
            />
          ))}
        </div>
      )}

      {editing && (
        <OfferEditDialog
          offer={editing}
          open={!!editing}
          onOpenChange={(v) => !v && setEditing(null)}
        />
      )}
    </div>
  );
}
