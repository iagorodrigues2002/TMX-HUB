'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Activity,
  AlertTriangle,
  BellRing,
  Building2,
  CircleDollarSign,
  LayoutDashboard,
  Link2,
  Loader2,
  Orbit,
  Plus,
  RefreshCw,
  Search,
  ShieldAlert,
  Signal,
  WalletCards,
  Zap,
} from 'lucide-react';
import { renderAccountList } from './meta-accounts-control-render-account-list';
import { renderConnectionSettings } from './meta-accounts-control-render-connection-settings';
import { renderPushcutSettings } from './meta-accounts-control-render-pushcut-settings';
import { type Filter, dateTime, money } from './meta-accounts-control-support';
import { useMetaAccountsControlState } from './meta-accounts-control-use-meta-accounts-control-state';

export function MetaAccountsControl() {
  const {
    filter,
    setFilter,
    search,
    setSearch,
    business,
    setBusiness,
    currency,
    setCurrency,
    expanded,
    setExpanded,
    showConnection,
    setShowConnection,
    showPushcut,
    setShowPushcut,
    selectedConnectionId,
    setSelectedConnectionId,
    pushcutForm,
    setPushcutForm,
    connectionForm,
    setConnectionForm,
    connections,
    selectedConnection,
    dashboard,
    pushcutConfig,
    sync,
    saveConnection,
    savePushcut,
    testPushcut,
    assignAccount,
    assignCampaign,
    accounts,
    businesses,
    businessStates,
    filtered,
    campaignsByAccount,
    counts,
    totals,
  } = useMetaAccountsControlState();

  return (
    <div className="signal-reveal space-y-6">
      <header className="glass-card tmx-command-hero overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary via-primary to-transparent p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <div className="mb-4 flex items-center gap-3">
              <div className="glass-card grid h-11 w-11 place-items-center rounded-xl border border-border bg-accent">
                <Orbit className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="hud-label">TMX Meta Control</p>
                <p className="mt-1 text-xs text-success">Marketing API · somente leitura</p>
              </div>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground md:text-4xl">
              Controle de contas
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
              Status operacional, investimento, campanhas e ofertas conectados em uma única central.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => setShowConnection((value) => !value)}
              className="gap-2 border-border bg-muted"
            >
              <Plus className="h-4 w-4" /> Novo dashboard
            </Button>
            <Button
              variant="outline"
              onClick={() => setShowPushcut((value) => !value)}
              disabled={!selectedConnection}
              className="gap-2 border-warning/30 bg-warning/10 text-warning hover:bg-warning/10"
            >
              <BellRing className="h-4 w-4" /> Alertas Pushcut
            </Button>
            <Button
              onClick={() => sync.mutate()}
              disabled={!selectedConnection || sync.isPending}
              className="gap-2 bg-primary text-accent-on hover:bg-primary"
            >
              {sync.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}{' '}
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      {(showConnection || (!connections.isLoading && !connections.data?.length)) &&
        renderConnectionSettings({ connectionForm, setConnectionForm, saveConnection })}

      {showPushcut &&
        selectedConnection &&
        renderPushcutSettings({
          pushcutForm,
          setPushcutForm,
          selectedConnection,
          pushcutConfig,
          savePushcut,
          testPushcut,
        })}

      {!!connections.data?.length && (
        <section className="glass-card rounded-2xl border border-border bg-gradient-to-r from-primary to-transparent p-4 sm:p-5">
          <div className="grid gap-4 lg:grid-cols-[minmax(240px,420px)_1fr] lg:items-center">
            <label>
              <span className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-primary">
                <LayoutDashboard className="h-3.5 w-3.5" /> Dashboard da empresa
              </span>
              <select
                value={selectedConnectionId}
                onChange={(event) => {
                  setSelectedConnectionId(event.target.value);
                  setExpanded(null);
                  setBusiness('all');
                  setCurrency('all');
                  setFilter('all');
                  setSearch('');
                }}
                className="h-12 w-full rounded-xl border border-border bg-bg-elevated px-4 text-sm font-medium text-foreground outline-none focus:border-border"
              >
                {connections.data.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </label>
            {selectedConnection && (
              <div className="glass-card flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-accent px-4 py-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-2">
                  <Signal className="h-3.5 w-3.5 text-success" /> App {selectedConnection.app_id}
                </span>
                {selectedConnection.last_sync_at ? (
                  <span>Última sincronização: {dateTime(selectedConnection.last_sync_at)}</span>
                ) : (
                  <span className="flex items-center gap-2 text-primary">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Importando dados da Meta…
                  </span>
                )}
                {selectedConnection.last_sync_error && (
                  <span className="text-danger">{selectedConnection.last_sync_error}</span>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {[
          { label: 'Contas', value: accounts.length, icon: WalletCards, tone: 'text-primary' },
          { label: 'Veiculando', value: counts.delivering, icon: Zap, tone: 'text-success' },
          { label: 'Ativas sem mídia', value: counts.idle, icon: Activity, tone: 'text-primary' },
          {
            label: 'Desativadas',
            value: counts.disabled,
            icon: ShieldAlert,
            tone: 'text-danger',
          },
          {
            label: 'Pendência',
            value: counts.unsettled,
            icon: AlertTriangle,
            tone: 'text-warning',
          },
          {
            label: 'BMs sem conta utilizável',
            value: [...businessStates.values()].filter((item) => item.off).length,
            icon: Building2,
            tone: 'text-danger',
          },
          {
            label: 'Não associadas',
            value: accounts.filter((item) => !item.primary_offer_id).length,
            icon: Link2,
            tone: 'text-orange-200',
          },
        ].map(({ label, value, icon: Icon, tone }) => (
          <div key={label} className="glass-card rounded-xl border border-border bg-muted p-4">
            <Icon className={cn('h-4 w-4', tone)} />
            <p className="mt-4 font-mono text-2xl text-foreground">{value}</p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              {label}
            </p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 md:grid-cols-2">
        {Object.entries(totals).map(([code, total]) => (
          <div
            key={code}
            className="glass-card rounded-xl border border-border bg-gradient-to-r from-primary to-transparent p-5"
          >
            <div className="flex items-center gap-2 text-muted-foreground">
              <CircleDollarSign className="h-4 w-4 text-primary" />
              <span className="hud-label">Gasto histórico · {code}</span>
            </div>
            <p className="mt-3 font-mono text-2xl text-foreground">{money(total, code)}</p>
          </div>
        ))}
      </section>

      <section className="glass-card rounded-2xl border border-border bg-background p-3 sm:p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_180px_150px]">
          <div className="relative">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <input
              aria-label="Buscar conta, ID, BM ou oferta"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar conta, ID, BM ou oferta"
              className="h-11 w-full rounded-lg border border-border bg-accent pl-10 pr-4 text-sm text-foreground outline-none focus:border-border"
            />
          </div>
          <select
            value={business}
            onChange={(event) => {
              setBusiness(event.target.value);
              setFilter('all');
              setCurrency('all');
              setSearch('');
            }}
            className="h-11 rounded-lg border border-border bg-bg-elevated px-3 text-sm text-foreground"
          >
            <option value="all">Todos os BMs</option>
            {businesses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <select
            value={currency}
            onChange={(event) => setCurrency(event.target.value)}
            className="h-11 rounded-lg border border-border bg-bg-elevated px-3 text-sm text-foreground"
          >
            <option value="all">Todas moedas</option>
            <option value="BRL">BRL</option>
            <option value="USD">USD</option>
          </select>
        </div>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
          {(
            [
              ['all', 'Todas'],
              ['delivering', 'Veiculando'],
              ['idle', 'Sem mídia'],
              ['disabled', 'Desativadas'],
              ['unsettled', 'Pendência'],
              ['attention', 'Atenção'],
            ] as Array<[Filter, string]>
          ).map(([key, label]) => (
            <button
              type="button"
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                'whitespace-nowrap rounded-full border px-3 py-2 text-xs transition',
                filter === key
                  ? 'border-border bg-accent text-primary'
                  : 'border-border text-muted-foreground hover:text-muted-foreground',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {dashboard.isLoading ? (
        <div className="grid min-h-64 place-items-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 inline h-5 w-5 animate-spin" /> Carregando contas…
        </div>
      ) : (
        renderAccountList({
          currency,
          expanded,
          setExpanded,
          dashboard,
          assignAccount,
          assignCampaign,
          businessStates,
          filtered,
          campaignsByAccount,
        })
      )}
    </div>
  );
}
