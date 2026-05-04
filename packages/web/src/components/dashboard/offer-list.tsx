'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  Copy,
  Loader2,
  Plus,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { apiClient, authToken, type OfferView } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { env } from '@/lib/env';

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
      toast.success('Dashboard criado.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteOffer(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['offers'] });
      qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      toast.success('Dashboard removido.');
    },
    onError: (err) => toast.error((err as Error).message),
  });

  return (
    <div className="space-y-4">
      <div className="flex items-baseline justify-between">
        <div>
          <p className="hud-label">Suas dashboards</p>
          <h2 className="mt-1 text-[16px] font-semibold text-white">
            {offers.length} ofertas conectadas
          </h2>
        </div>
        <Button
          size="sm"
          onClick={() => setShowCreate((v) => !v)}
          variant={showCreate ? 'outline' : 'default'}
        >
          <Plus className="h-3.5 w-3.5" />
          {showCreate ? 'Cancelar' : 'Criar dashboard'}
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
                placeholder="690cf9fc15e48d623b09c712"
                disabled={createMut.isPending}
              />
            </div>
          </div>
          <p className="text-[11px] text-white/40">
            O <code className="text-white/65">dashboardId</code> é só uma referência usada no
            workflow do n8n. Você consegue trocar depois — não trava nada se ficar vazio.
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
            Você ainda não tem nenhuma dashboard. Crie a primeira para começar a receber
            métricas do n8n.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {offers.map((o) => (
            <OfferCard key={o.id} offer={o} onDelete={() => deleteMut.mutate(o.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function OfferCard({ offer, onDelete }: { offer: OfferView; onDelete: () => void }) {
  const ingestUrl = `${env.NEXT_PUBLIC_API_URL}/v1/offers/${offer.id}/ingest`;
  const token = authToken.get();

  const copyToken = () => {
    if (!token) {
      toast.error('Você não tem token de auth. Faça login novamente.');
      return;
    }
    navigator.clipboard.writeText(token).then(
      () => toast.success('Token copiado.'),
      () => toast.error('Não consegui copiar — copie manualmente.'),
    );
  };

  const copyUrl = () => {
    navigator.clipboard.writeText(ingestUrl).then(
      () => toast.success('URL de ingest copiada.'),
      () => toast.error('Não consegui copiar — copie manualmente.'),
    );
  };

  return (
    <div className="glass-card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link
            href={`/dashboards/${offer.id}`}
            className="text-[15px] font-semibold text-white hover:text-cyan-200"
          >
            {offer.name}
          </Link>
          {offer.dashboardId && (
            <p className="mt-0.5 truncate font-mono text-[10px] text-white/40">
              utmify: {offer.dashboardId}
            </p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm(`Remover dashboard "${offer.name}" e todos os snapshots?`)) onDelete();
          }}
          aria-label="Remover"
          title="Remover"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="rounded-md border border-white/[0.06] bg-black/20 p-2 text-[10px]">
        <p className="hud-label">Ingest URL (para o n8n)</p>
        <p className="mt-1 break-all font-mono text-white/65">{ingestUrl}</p>
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="ghost" onClick={copyUrl}>
            <Copy className="h-3 w-3" />
            URL
          </Button>
          <Button size="sm" variant="ghost" onClick={copyToken}>
            <Copy className="h-3 w-3" />
            Token
          </Button>
        </div>
      </div>

      <Button asChild size="sm" variant="outline" className="w-full">
        <Link href={`/dashboards/${offer.id}`}>
          <Activity className="h-3.5 w-3.5" />
          Abrir dashboard
        </Link>
      </Button>
    </div>
  );
}
