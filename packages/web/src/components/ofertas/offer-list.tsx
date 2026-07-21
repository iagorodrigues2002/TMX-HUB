'use client';

import { Kpi, formatCurrency, formatRoas } from '@/components/dashboard/kpi-cards';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type OfferView, apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Building2,
  Loader2,
  Plus,
  Receipt,
  RefreshCw,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { OfferCard } from './offer-card';
import { OfferEditDialog } from './offer-edit-dialog';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function nDaysAgoIso(n: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - n);
  return date.toISOString().slice(0, 10);
}

export function OfferList() {
  const qc = useQueryClient();
  const [from, setFrom] = useState(() => nDaysAgoIso(6));
  const [to, setTo] = useState(() => todayIso());
  const [showCreate, setShowCreate] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [dashboardId, setDashboardId] = useState('');
  const [utmifyLogin, setUtmifyLogin] = useState('');
  const [utmifyPassword, setUtmifyPassword] = useState('');
  const [editing, setEditing] = useState<OfferView | null>(null);

  const offersQuery = useQuery<OfferView[]>({
    queryKey: ['offers'],
    queryFn: () => apiClient.listOffers(),
    refetchInterval: 30_000,
  });
  const summaryQuery = useQuery({
    queryKey: ['dashboard-summary', from, to],
    queryFn: () => apiClient.getDashboardSummary({ from, to }),
    refetchInterval: 60_000,
  });
  const offers = offersQuery.data ?? [];

  const createMut = useMutation({
    mutationFn: () =>
      apiClient.createOffer({
        company_name: companyName.trim(),
        name: name.trim(),
        dashboard_id: dashboardId.trim(),
        utmify_login: utmifyLogin.trim(),
        utmify_password: utmifyPassword,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      setShowCreate(false);
      setCompanyName('');
      setName('');
      setDashboardId('');
      setUtmifyLogin('');
      setUtmifyPassword('');
      toast.success('Oferta criada. A primeira sincronização já começou.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => apiClient.deleteOffer(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      toast.success('Oferta removida.');
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const syncMut = useMutation({
    mutationFn: (id: string) => apiClient.syncOffer(id),
    onSuccess: (result) => {
      void qc.invalidateQueries({ queryKey: ['offers'] });
      void qc.invalidateQueries({ queryKey: ['dashboard-summary'] });
      toast.success(
        result.skipped
          ? 'A sincronização já estava em andamento.'
          : `${result.ads} ads atualizados${result.failedDays ? ` · ${result.failedDays} dia(s) com erro` : ''}.`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });

  const canCreate =
    companyName.trim() && name.trim() && dashboardId.trim() && utmifyLogin.trim() && utmifyPassword;
  const summary = summaryQuery.data;

  return (
    <div className="space-y-7">
      <section className="space-y-4">
        <div className="glass-card flex flex-wrap items-end gap-3 p-4">
          <div className="space-y-1">
            <Label className="hud-label">De</Label>
            <Input
              type="date"
              value={from}
              onChange={(event) => setFrom(event.target.value)}
              className="h-9 w-[150px]"
            />
          </div>
          <div className="space-y-1">
            <Label className="hud-label">Até</Label>
            <Input
              type="date"
              value={to}
              onChange={(event) => setTo(event.target.value)}
              className="h-9 w-[150px]"
            />
          </div>
          <div className="ml-auto text-right">
            <p className="hud-label">Atualização automática</p>
            <p className="mt-1 text-[12px] text-emerald-300">UTMify · a cada 30 minutos</p>
          </div>
        </div>

        {summaryQuery.isLoading || !summary ? (
          <div className="glass-card flex items-center justify-center p-10">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {summary.currencyTotals.map(({ currency, totals }) => (
                <div key={currency} className="grid gap-3 md:grid-cols-3">
                  <Kpi label={`Investimento geral · ${currency}`} value={formatCurrency(totals.spend, currency)} icon={<Wallet className="h-4 w-4" />} tone="spend" />
                  <Kpi label={`Faturamento geral · ${currency}`} value={formatCurrency(totals.revenue, currency)} icon={<Receipt className="h-4 w-4" />} tone="positive" />
                  <Kpi label={`ROAS geral · ${currency}`} value={formatRoas(totals.roas)} icon={<TrendingUp className="h-4 w-4" />} tone={totals.roas !== null && totals.roas >= 1 ? 'positive' : 'warn'} />
                </div>
              ))}
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {summary.offers.map((entry) => (
                <Link
                  key={entry.offer.id}
                  href={`/ofertas/${entry.offer.id}`}
                  className="glass-card group space-y-4 p-4 transition hover:border-cyan-300/35"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-[11px] text-white/45">
                        <Building2 className="h-3.5 w-3.5" />
                        {entry.offer.companyName ?? 'Operação'}
                      </p>
                      <h3 className="mt-1 truncate text-[16px] font-semibold text-white">
                        {entry.offer.name}
                      </h3>
                    </div>
                    <ArrowRight className="h-4 w-4 text-cyan-300 transition group-hover:translate-x-0.5" />
                  </div>
                  <dl className="grid grid-cols-3 gap-2">
                    <div>
                      <dt className="hud-label">Investido</dt>
                      <dd className="mt-1 font-mono text-[12px] text-amber-300">
                        {formatCurrency(entry.totals.spend, entry.offer.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="hud-label">Faturamento</dt>
                      <dd className="mt-1 font-mono text-[12px] text-emerald-300">
                        {formatCurrency(entry.totals.revenue, entry.offer.currency)}
                      </dd>
                    </div>
                    <div>
                      <dt className="hud-label">ROAS</dt>
                      <dd className="mt-1 font-mono text-[12px] text-cyan-300">
                        {formatRoas(entry.totals.roas)}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-[10px] uppercase tracking-[0.13em] text-white/35">
                    Clique para abrir os ads e seus dados
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <p className="hud-label">Conexões</p>
            <h2 className="mt-1 text-[16px] font-semibold text-white">
              {offers.length} ofertas cadastradas
            </h2>
          </div>
          <Button
            size="sm"
            onClick={() => setShowCreate((value) => !value)}
            variant={showCreate ? 'outline' : 'default'}
          >
            <Plus className="h-3.5 w-3.5" />
            {showCreate ? 'Cancelar' : 'Nova oferta'}
          </Button>
        </div>

        {showCreate && (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (canCreate) createMut.mutate();
            }}
            className="glass-card space-y-4 p-5"
          >
            <div>
              <p className="hud-label">Nova conexão UTMify</p>
              <p className="mt-1 text-[12px] text-white/45">
                Login e senha ficam criptografados no backend e nunca retornam para o navegador.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Empresa">
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex: Empresa 1"
                />
              </Field>
              <Field label="Nome da oferta">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: PFL Brasil"
                />
              </Field>
              <Field label="Login UTMify">
                <Input
                  value={utmifyLogin}
                  onChange={(e) => setUtmifyLogin(e.target.value)}
                  autoComplete="username"
                  placeholder="seu@email.com"
                />
              </Field>
              <Field label="Senha UTMify">
                <Input
                  type="password"
                  value={utmifyPassword}
                  onChange={(e) => setUtmifyPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </Field>
              <Field label="ID da dashboard">
                <Input
                  value={dashboardId}
                  onChange={(e) => setDashboardId(e.target.value)}
                  className="font-mono text-[12px]"
                  placeholder="6a2182d753f10e2ba0fb2ed2"
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={!canCreate || createMut.isPending}>
                {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Criar e
                sincronizar
              </Button>
            </div>
          </form>
        )}

        {offersQuery.isLoading ? (
          <div className="glass-card flex items-center justify-center p-12">
            <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
          </div>
        ) : offers.length === 0 ? (
          <div className="glass-card p-10 text-center text-[13px] text-white/50">
            Cadastre sua primeira empresa e oferta para iniciar a análise.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {offers.map((offer) => (
              <div key={offer.id} className="space-y-2">
                <OfferCard
                  offer={offer}
                  onEdit={() => setEditing(offer)}
                  onDelete={() => deleteMut.mutate(offer.id)}
                />
                <div className="flex items-center justify-between px-1 text-[11px] text-white/45">
                  <span>{syncLabel(offer)}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => syncMut.mutate(offer.id)}
                    disabled={syncMut.isPending || offer.syncStatus === 'syncing'}
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${offer.syncStatus === 'syncing' ? 'animate-spin' : ''}`}
                    />
                    Sincronizar
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {editing && (
        <OfferEditDialog offer={editing} open onOpenChange={(open) => !open && setEditing(null)} />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function syncLabel(offer: OfferView): string {
  if (offer.syncStatus === 'syncing') return 'Sincronizando agora…';
  if (offer.syncStatus === 'partial') {
    return `Parcial: ${offer.lastSyncError ?? 'alguns dias falharam'}`;
  }
  if (offer.syncStatus === 'error') return `Erro: ${offer.lastSyncError ?? 'verifique a conexão'}`;
  if (offer.lastSyncAt) return `Atualizado ${new Date(offer.lastSyncAt).toLocaleString('pt-BR')}`;
  return offer.utmifyConfigured ? 'Aguardando primeira sincronização' : 'UTMify não conectada';
}
