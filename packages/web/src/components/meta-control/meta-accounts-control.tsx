'use client';

import { Button } from '@/components/ui/button';
import {
  type MetaControlAccount,
  type MetaControlCampaign,
  apiClient,
} from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Activity,
  AlertTriangle,
  Building2,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Link2,
  Loader2,
  Orbit,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Signal,
  WalletCards,
  Zap,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

type Filter = 'all' | 'delivering' | 'idle' | 'disabled' | 'unsettled' | 'attention';

const statusCopy: Record<MetaControlAccount['operational_state'], string> = {
  delivering: 'Veiculando',
  idle: 'Ativa sem veiculação',
  disabled: 'Desativada',
  unsettled: 'Pendência financeira',
  attention: 'Requer atenção',
};

const statusTone: Record<MetaControlAccount['operational_state'], string> = {
  delivering: 'border-emerald-300/20 bg-emerald-300/[0.07] text-emerald-200',
  idle: 'border-cyan-300/20 bg-cyan-300/[0.06] text-cyan-100',
  disabled: 'border-red-300/20 bg-red-300/[0.06] text-red-200',
  unsettled: 'border-amber-300/20 bg-amber-300/[0.07] text-amber-100',
  attention: 'border-orange-300/20 bg-orange-300/[0.07] text-orange-100',
};

function money(minor: string | number, currency: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(Number(minor) / 100);
}

function dateTime(value?: string | null): string {
  if (!value) return 'Nunca';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(new Date(value));
}

function HealthRing({ score }: { score: number }) {
  const color = score >= 80 ? 'text-emerald-300' : score >= 50 ? 'text-amber-300' : 'text-red-300';
  return (
    <div className={cn('grid h-12 w-12 shrink-0 place-items-center rounded-full border bg-black/20 font-mono text-sm', color, score >= 80 ? 'border-emerald-300/20' : score >= 50 ? 'border-amber-300/20' : 'border-red-300/20')}>
      {score}
    </div>
  );
}

export function MetaAccountsControl() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [business, setBusiness] = useState('all');
  const [currency, setCurrency] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showConnection, setShowConnection] = useState(false);
  const [connectionForm, setConnectionForm] = useState({
    name: 'Meta · TheMinex',
    app_id: '',
    app_secret: '',
    access_token: '',
  });

  const connection = useQuery({
    queryKey: ['meta-control-connection'],
    queryFn: () => apiClient.getMetaControlConnection(),
  });
  const dashboard = useQuery({
    queryKey: ['meta-control-dashboard'],
    queryFn: () => apiClient.getMetaControlDashboard(),
    enabled: Boolean(connection.data),
  });
  const sync = useMutation({
    mutationFn: () => apiClient.syncMetaControl(),
    onSuccess: (result) => {
      toast.success(`${result.accounts} contas e ${result.campaigns} campanhas sincronizadas.`);
      void queryClient.invalidateQueries({ queryKey: ['meta-control-dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['meta-control-connection'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Falha na sincronização.'),
  });
  const saveConnection = useMutation({
    mutationFn: () => apiClient.saveMetaControlConnection(connectionForm),
    onSuccess: (result) => {
      toast.success(result.warning ? `Conexão salva: ${result.warning}` : 'Conexão validada e salva.');
      setShowConnection(false);
      setConnectionForm((current) => ({ ...current, app_secret: '', access_token: '' }));
      void queryClient.invalidateQueries({ queryKey: ['meta-control-connection'] });
      void queryClient.invalidateQueries({ queryKey: ['meta-control-dashboard'] });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'Não foi possível conectar.'),
  });
  const assignAccount = useMutation({
    mutationFn: ({ accountId, offerId }: { accountId: string; offerId: string | null }) =>
      apiClient.assignMetaAccountOffer(accountId, offerId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['meta-control-dashboard'] }),
    onError: () => toast.error('Não foi possível associar a oferta.'),
  });
  const assignCampaign = useMutation({
    mutationFn: ({ campaignId, offerId }: { campaignId: string; offerId: string | null }) =>
      apiClient.assignMetaCampaignOffer(campaignId, offerId),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['meta-control-dashboard'] }),
    onError: () => toast.error('Não foi possível associar a campanha.'),
  });

  const accounts = dashboard.data?.accounts ?? [];
  const businesses = useMemo(
    () => [...new Set(accounts.map((account) => account.business_name ?? 'Sem BM'))].sort(),
    [accounts],
  );
  const businessStates = useMemo(() => {
    const grouped = new Map<string, MetaControlAccount[]>();
    for (const account of accounts) {
      if (!account.business_name) continue;
      grouped.set(account.business_name, [...(grouped.get(account.business_name) ?? []), account]);
    }
    return new Map(
      [...grouped.entries()].map(([name, items]) => [
        name,
        {
          usable: items.filter((item) => item.account_status === 1).length,
          total: items.length,
          off: !items.some((item) => item.account_status === 1),
        },
      ]),
    );
  }, [accounts]);
  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return accounts.filter((account) => {
      if (filter !== 'all' && account.operational_state !== filter) return false;
      if (business !== 'all' && (account.business_name ?? 'Sem BM') !== business) return false;
      if (currency !== 'all' && account.currency !== currency) return false;
      if (term && !`${account.name} ${account.external_id} ${account.business_name ?? ''} ${account.primary_offer_name ?? ''}`.toLowerCase().includes(term)) return false;
      return true;
    });
  }, [accounts, business, currency, filter, search]);
  const campaignsByAccount = useMemo(() => {
    const map = new Map<string, MetaControlCampaign[]>();
    for (const campaign of dashboard.data?.campaigns ?? []) {
      map.set(campaign.account_id, [...(map.get(campaign.account_id) ?? []), campaign]);
    }
    return map;
  }, [dashboard.data?.campaigns]);
  const counts = useMemo(
    () => ({
      delivering: accounts.filter((item) => item.operational_state === 'delivering').length,
      idle: accounts.filter((item) => item.operational_state === 'idle').length,
      disabled: accounts.filter((item) => item.operational_state === 'disabled').length,
      unsettled: accounts.filter((item) => item.operational_state === 'unsettled').length,
      attention: accounts.filter((item) => item.operational_state === 'attention').length,
    }),
    [accounts],
  );
  const totals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const account of accounts) out[account.currency] = (out[account.currency] ?? 0) + Number(account.amount_spent_minor);
    return out;
  }, [accounts]);

  return (
    <div className="signal-reveal space-y-6">
      <header className="tmx-command-hero overflow-hidden rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/[0.09] via-white/[0.025] to-transparent p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl border border-cyan-300/25 bg-cyan-300/[0.08]"><Orbit className="h-5 w-5 text-cyan-300" /></div>
              <div><p className="hud-label">TMX Meta Control</p><p className="mt-1 text-xs text-emerald-200/70">Marketing API · somente leitura</p></div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white md:text-4xl">Controle de contas</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/50">Status operacional, investimento, campanhas e ofertas conectados em uma única central.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowConnection((value) => !value)} className="gap-2 border-white/10 bg-white/[0.03]"><Settings2 className="h-4 w-4" /> Conexão</Button>
            <Button onClick={() => sync.mutate()} disabled={!connection.data || sync.isPending} className="gap-2 bg-cyan-300 text-slate-950 hover:bg-cyan-200">
              {sync.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Atualizar
            </Button>
          </div>
        </div>
      </header>

      {(showConnection || !connection.data) && (
        <section className="rounded-2xl border border-cyan-300/15 bg-[#071720]/90 p-5 sm:p-6">
          <div className="flex items-start gap-3"><ShieldAlert className="mt-0.5 h-5 w-5 text-cyan-300" /><div><h2 className="font-semibold text-white">Conectar aplicativo Meta</h2><p className="mt-1 text-xs leading-5 text-white/40">As credenciais são criptografadas. Para produção, utilize token de usuário do sistema.</p></div></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <input aria-label="Nome da conexão" value={connectionForm.name} onChange={(event) => setConnectionForm({ ...connectionForm, name: event.target.value })} placeholder="Nome da conexão" className="h-11 rounded-lg border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-cyan-300/40" />
            <input aria-label="ID do aplicativo" value={connectionForm.app_id} onChange={(event) => setConnectionForm({ ...connectionForm, app_id: event.target.value })} placeholder="ID do aplicativo" className="h-11 rounded-lg border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-cyan-300/40" />
            <input type="password" aria-label="Secret do aplicativo" value={connectionForm.app_secret} onChange={(event) => setConnectionForm({ ...connectionForm, app_secret: event.target.value })} placeholder="App Secret" className="h-11 rounded-lg border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-cyan-300/40" />
            <input type="password" aria-label="Token de acesso" value={connectionForm.access_token} onChange={(event) => setConnectionForm({ ...connectionForm, access_token: event.target.value })} placeholder="Token de usuário do sistema" className="h-11 rounded-lg border border-white/10 bg-black/20 px-4 text-sm text-white outline-none focus:border-cyan-300/40" />
          </div>
          <div className="mt-4 flex justify-end"><Button onClick={() => saveConnection.mutate()} disabled={saveConnection.isPending || !connectionForm.app_id || !connectionForm.app_secret || !connectionForm.access_token}>{saveConnection.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Validar e conectar</Button></div>
        </section>
      )}

      {connection.data && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-3 text-xs text-white/40">
          <span className="flex items-center gap-2"><Signal className="h-3.5 w-3.5 text-emerald-300" /> {connection.data.name} · App {connection.data.app_id}</span>
          <span>Última sincronização: {dateTime(connection.data.last_sync_at)}</span>
          {connection.data.last_sync_error && <span className="text-red-200">{connection.data.last_sync_error}</span>}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {[
          { label: 'Contas', value: accounts.length, icon: WalletCards, tone: 'text-cyan-200' },
          { label: 'Veiculando', value: counts.delivering, icon: Zap, tone: 'text-emerald-200' },
          { label: 'Ativas sem mídia', value: counts.idle, icon: Activity, tone: 'text-cyan-100' },
          { label: 'Desativadas', value: counts.disabled, icon: ShieldAlert, tone: 'text-red-200' },
          { label: 'Pendência', value: counts.unsettled, icon: AlertTriangle, tone: 'text-amber-200' },
          { label: 'BMs sem conta utilizável', value: [...businessStates.values()].filter((item) => item.off).length, icon: Building2, tone: 'text-red-200' },
          { label: 'Não associadas', value: accounts.filter((item) => !item.primary_offer_id).length, icon: Link2, tone: 'text-orange-200' },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="rounded-xl border border-white/[0.08] bg-white/[0.025] p-4"><Icon className={cn('h-4 w-4', tone)} /><p className="mt-4 font-mono text-2xl text-white">{value}</p><p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-white/35">{label}</p></div>
        ))}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {Object.entries(totals).map(([code, total]) => (
          <div key={code} className="rounded-xl border border-cyan-300/10 bg-gradient-to-r from-cyan-300/[0.05] to-transparent p-5"><div className="flex items-center gap-2 text-white/40"><CircleDollarSign className="h-4 w-4 text-cyan-300" /><span className="hud-label">Gasto histórico · {code}</span></div><p className="mt-3 font-mono text-2xl text-white">{money(total, code)}</p></div>
        ))}
      </section>

      <section className="rounded-2xl border border-white/[0.08] bg-[#06131b]/75 p-3 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_150px]">
          <label className="relative"><Search className="absolute left-3 top-3.5 h-4 w-4 text-white/25" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar conta, ID, BM ou oferta" className="h-11 w-full rounded-lg border border-white/10 bg-black/20 pl-10 pr-4 text-sm text-white outline-none focus:border-cyan-300/35" /></label>
          <select
            value={business}
            onChange={(event) => {
              setBusiness(event.target.value);
              setFilter('all');
              setCurrency('all');
              setSearch('');
            }}
            className="h-11 rounded-lg border border-white/10 bg-[#071720] px-3 text-sm text-white"
          >
            <option value="all">Todos os BMs</option>
            {businesses.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-11 rounded-lg border border-white/10 bg-[#071720] px-3 text-sm text-white"><option value="all">Todas moedas</option><option value="BRL">BRL</option><option value="USD">USD</option></select>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {([
            ['all', 'Todas'], ['delivering', 'Veiculando'], ['idle', 'Sem mídia'], ['disabled', 'Desativadas'], ['unsettled', 'Pendência'], ['attention', 'Atenção'],
          ] as Array<[Filter, string]>).map(([key, label]) => <button key={key} onClick={() => setFilter(key)} className={cn('whitespace-nowrap rounded-full border px-3 py-2 text-xs transition', filter === key ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-100' : 'border-white/[0.08] text-white/40 hover:text-white/70')}>{label}</button>)}
        </div>
      </section>

      {dashboard.isLoading ? <div className="grid min-h-64 place-items-center text-sm text-white/40"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Carregando contas…</div> : (
        <div className="space-y-3">
          {filtered.map((account) => {
            const accountCampaigns = campaignsByAccount.get(account.id) ?? [];
            const isOpen = expanded === account.id;
            const businessState = account.business_name ? businessStates.get(account.business_name) : null;
            return (
              <article key={account.id} className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.022]">
                <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1.5fr_1fr_1fr_1fr_auto] xl:items-center">
                  <div className="flex items-start gap-3"><HealthRing score={account.health_score} /><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="truncate font-semibold text-white">{account.name}</h2><span className={cn('rounded-full border px-2 py-1 text-[10px] uppercase tracking-wider', statusTone[account.operational_state])}>{statusCopy[account.operational_state]}</span>{businessState?.off && <span className="rounded-full border border-red-300/25 bg-red-300/[0.08] px-2 py-1 text-[10px] uppercase tracking-wider text-red-200">BM sem contas utilizáveis</span>}</div><p className="mt-1 font-mono text-[11px] text-white/35">act_{account.external_id}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-white/45"><Building2 className="h-3.5 w-3.5" /> {account.business_name ?? 'Conta pessoal'}{businessState && <span className={businessState.off ? 'text-red-200/70' : 'text-emerald-200/60'}>· {businessState.usable}/{businessState.total} utilizável(is)</span>}</p></div></div>
                  <div>
                    <p className="hud-label">Gasto histórico</p>
                    <p className="mt-2 font-mono text-lg text-white">{money(account.amount_spent_minor, account.currency)}</p>
                    <p className="mt-1 text-xs text-white/35">30 dias: {money(account.spend_30d_minor, account.currency)}</p>
                    {account.operational_state === 'unsettled' && (
                      <div className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2">
                        <p className="text-[10px] uppercase tracking-[0.14em] text-amber-200/55">Pendência informada</p>
                        <p className="mt-1 font-mono text-base text-amber-100">{money(account.balance_minor, account.currency)}</p>
                        {Number(account.balance_minor) === 0 && <p className="mt-1 text-[10px] leading-4 text-white/35">A Meta sinalizou a conta, mas retornou saldo financeiro zero.</p>}
                      </div>
                    )}
                  </div>
                  <div><p className="hud-label">Operação</p><p className="mt-2 text-sm text-white/70">{account.campaigns_active} ativa(s) · {account.campaigns_total} total</p><p className="mt-1 text-xs text-white/35">{Number(account.impressions_30d).toLocaleString('pt-BR')} impressões</p></div>
                  <div><p className="hud-label">Oferta principal</p><select aria-label={`Oferta da conta ${account.name}`} value={account.primary_offer_id ?? ''} onChange={(event) => assignAccount.mutate({ accountId: account.id, offerId: event.target.value || null })} className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-[#071720] px-3 text-sm text-white"><option value="">Não associada</option>{(dashboard.data?.offers ?? []).map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}</select></div>
                  <button onClick={() => setExpanded(isOpen ? null : account.id)} className="flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-white/50 hover:bg-white/[0.04] hover:text-white">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />} Campanhas</button>
                </div>
                {isOpen && <div className="border-t border-white/[0.07] bg-black/10 p-4 sm:p-5"><div className="space-y-2">{accountCampaigns.length ? accountCampaigns.map((campaign) => <div key={campaign.id} className="grid gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 md:grid-cols-[1fr_auto_240px] md:items-center"><div className="min-w-0"><p className="truncate text-sm text-white/75">{campaign.name}</p><p className="mt-1 font-mono text-[10px] text-white/30">{campaign.external_id}</p></div><span className={cn('w-fit rounded-full border px-2 py-1 text-[10px]', campaign.effective_status === 'ACTIVE' ? 'border-emerald-300/15 text-emerald-200' : 'border-white/10 text-white/35')}>{campaign.effective_status ?? campaign.configured_status ?? '—'}</span><select aria-label={`Oferta da campanha ${campaign.name}`} value={campaign.offer_id ?? account.primary_offer_id ?? ''} onChange={(event) => assignCampaign.mutate({ campaignId: campaign.id, offerId: event.target.value || null })} className="h-9 rounded-lg border border-white/10 bg-[#071720] px-3 text-xs text-white"><option value="">Herdar / sem oferta</option>{(dashboard.data?.offers ?? []).map((offer) => <option key={offer.id} value={offer.id}>{offer.name}</option>)}</select></div>) : <p className="py-5 text-center text-sm text-white/35">Nenhuma campanha encontrada.</p>}</div></div>}
              </article>
            );
          })}
          {!filtered.length && <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-white/35">Nenhuma conta encontrada para estes filtros.</div>}
        </div>
      )}
    </div>
  );
}
