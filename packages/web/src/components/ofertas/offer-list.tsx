'use client';

import { formatCurrency, formatRoas } from '@/components/dashboard/kpi-cards';
import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Kpi } from '@/components/ui/kpi';
import { type OfferView, apiClient } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { PERIOD_DATE_PRESETS, rollingDateRange } from '@/lib/date-range';
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
import { OfferMemberPicker } from './offer-member-picker';

export function OfferList() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [period, setPeriod] = useState(() => rollingDateRange(7));
  const { from, to } = period;
  const [showCreate, setShowCreate] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [name, setName] = useState('');
  const [dashboardId, setDashboardId] = useState('');
  const [utmifyLogin, setUtmifyLogin] = useState('');
  const [utmifyPassword, setUtmifyPassword] = useState('');
  const [editing, setEditing] = useState<OfferView | null>(null);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [createAttempted, setCreateAttempted] = useState(false);

  const usersQuery = useQuery({
    queryKey: ['users-list'],
    queryFn: () => apiClient.listUsers(),
    enabled: user?.role === 'admin',
  });

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
        ...(user?.role === 'admin' ? { member_ids: memberIds } : {}),
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
      setMemberIds([]);
      setCreateAttempted(false);
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
  const createErrors = {
    companyName: companyName.trim() ? null : 'Informe o nome da empresa.',
    name: name.trim() ? null : 'Informe o nome da oferta.',
    dashboardId: dashboardId.trim() ? null : 'Informe o ID da dashboard.',
    utmifyLogin: utmifyLogin.trim() ? null : 'Informe o login da UTMify.',
    utmifyPassword: utmifyPassword ? null : 'Informe a senha da UTMify.',
  };
  const summary = summaryQuery.data;

  return (
    <div className="space-y-7">
      <section className="space-y-4">
        <DateRangeFilter
          value={period}
          onChange={setPeriod}
          presets={PERIOD_DATE_PRESETS}
          status={
            <>
              <p className="hud-label">Atualização automática</p>
              <p className="mt-1 text-[12px] text-emerald-300">UTMify · a cada 30 minutos</p>
            </>
          }
        />

        {summaryQuery.isLoading ? (
          <DataState variant="loading" title="Carregando resumo das ofertas…" />
        ) : summaryQuery.isError && !summary ? (
          <DataState
            variant="error"
            title="Não foi possível carregar o resumo"
            description="A lista de conexões continua abaixo. Tente consultar as métricas novamente."
            isRetrying={summaryQuery.isFetching}
            onRetry={() => void summaryQuery.refetch()}
          />
        ) : !summary ? (
          <DataState
            variant="empty"
            title="Resumo indisponível"
            description="Ainda não há métricas consolidadas para este período."
          />
        ) : (
          <>
            <div className="space-y-3">
              {summary.accounts.map((account) => (
                <section
                  key={account.ownerId}
                  className="space-y-3 rounded-xl border border-cyan-300/[0.14] bg-cyan-300/[0.025] p-3"
                >
                  <div className="flex items-center justify-between border-b border-cyan-300/[0.1] pb-2">
                    <div>
                      <p className="hud-label">Resumo da conta</p>
                      <h2 className="mt-1 text-[15px] font-semibold text-white">
                        {account.ownerName}
                      </h2>
                    </div>
                    <span className="text-[11px] text-cyan-100/65">
                      {account.offers.length} ofertas
                    </span>
                  </div>
                  {account.currencyTotals.map(({ currency, totals }) => (
                    <div key={currency} className="grid gap-3 md:grid-cols-3">
                      <Kpi
                        label={`Investimento · ${currency}`}
                        value={formatCurrency(totals.spend, currency)}
                        icon={<Wallet className="h-4 w-4" />}
                        tone="spend"
                        variant="financial"
                      />
                      <Kpi
                        label={`Faturamento · ${currency}`}
                        value={formatCurrency(totals.revenue, currency)}
                        icon={<Receipt className="h-4 w-4" />}
                        tone="positive"
                        variant="financial"
                      />
                      <Kpi
                        label={`ROAS · ${currency}`}
                        value={formatRoas(totals.roas)}
                        icon={<TrendingUp className="h-4 w-4" />}
                        tone={totals.roas !== null && totals.roas >= 1 ? 'positive' : 'warn'}
                        variant="financial"
                      />
                    </div>
                  ))}
                </section>
              ))}
            </div>
            <div className="space-y-6">
              {summary.accounts.map((account) => (
                <section key={account.ownerId} className="space-y-3">
                  <p className="px-1 text-[12px] font-medium text-cyan-100/75">
                    Ofertas · {account.ownerName}
                  </p>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {account.offers.map((entry) => (
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
                        <dl className="grid gap-2 min-[380px]:grid-cols-3">
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
                </section>
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
              setCreateAttempted(true);
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
              <FormField
                id="offer-company"
                label="Empresa"
                error={createAttempted ? createErrors.companyName : null}
              >
                <Input
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="Ex: Empresa 1"
                />
              </FormField>
              <FormField
                id="offer-name"
                label="Nome da oferta"
                error={createAttempted ? createErrors.name : null}
              >
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: PFL Brasil"
                />
              </FormField>
              <FormField
                id="offer-utmify-login"
                label="Login UTMify"
                error={createAttempted ? createErrors.utmifyLogin : null}
              >
                <Input
                  value={utmifyLogin}
                  onChange={(e) => setUtmifyLogin(e.target.value)}
                  autoComplete="username"
                  placeholder="seu@email.com"
                />
              </FormField>
              <FormField
                id="offer-utmify-password"
                label="Senha UTMify"
                error={createAttempted ? createErrors.utmifyPassword : null}
              >
                <Input
                  type="password"
                  value={utmifyPassword}
                  onChange={(e) => setUtmifyPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </FormField>
              <FormField
                id="offer-dashboard-id"
                label="ID da dashboard"
                error={createAttempted ? createErrors.dashboardId : null}
              >
                <Input
                  value={dashboardId}
                  onChange={(e) => setDashboardId(e.target.value)}
                  className="font-mono text-[12px]"
                  placeholder="6a2182d753f10e2ba0fb2ed2"
                />
              </FormField>
            </div>
            {user?.role === 'admin' && (
              <OfferMemberPicker
                members={usersQuery.data ?? []}
                selected={memberIds}
                onChange={setMemberIds}
                loading={usersQuery.isLoading}
              />
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Criar e
                sincronizar
              </Button>
            </div>
          </form>
        )}

        {offersQuery.isLoading ? (
          <DataState variant="loading" title="Carregando ofertas…" />
        ) : offersQuery.isError && !offersQuery.data ? (
          <DataState
            variant="error"
            title="Não foi possível carregar as ofertas"
            description="Verifique a conexão com a API e tente novamente."
            isRetrying={offersQuery.isFetching}
            onRetry={() => void offersQuery.refetch()}
          />
        ) : offers.length === 0 ? (
          <DataState
            variant="empty"
            title="Nenhuma oferta cadastrada"
            description="Cadastre sua primeira empresa e oferta para iniciar a análise."
          />
        ) : (
          <>
            {offersQuery.isError && (
              <output
                aria-live="polite"
                className="mb-3 block rounded-xl border border-warning/25 bg-warning/[0.07] px-4 py-3 text-sm text-warning"
              >
                Não foi possível atualizar agora. Exibindo as últimas ofertas carregadas.
              </output>
            )}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {offers.map((offer) => (
                <div key={offer.id} className="space-y-2">
                  <OfferCard
                    offer={offer}
                    {...(offer.canManage
                      ? {
                          onEdit: () => setEditing(offer),
                          onDelete: () => deleteMut.mutate(offer.id),
                        }
                      : {})}
                  />
                  <div className="flex items-center justify-between px-1 text-[11px] text-white/45">
                    <span>{syncLabel(offer)}</span>
                    {offer.canManage && (
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
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {editing && (
        <OfferEditDialog offer={editing} open onOpenChange={(open) => !open && setEditing(null)} />
      )}
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
