'use client';

import { cn } from '@/lib/utils';
import { Building2, ChevronDown, ChevronRight } from 'lucide-react';
import { HealthRing, money, statusCopy, statusTone } from './meta-accounts-control-support';
import type { useMetaAccountsControlState } from './meta-accounts-control-use-meta-accounts-control-state';

export function renderAccountList({
  currency,
  expanded,
  setExpanded,
  dashboard,
  assignAccount,
  assignCampaign,
  businessStates,
  filtered,
  campaignsByAccount,
}: Pick<
  ReturnType<typeof useMetaAccountsControlState>,
  | 'currency'
  | 'expanded'
  | 'setExpanded'
  | 'dashboard'
  | 'assignAccount'
  | 'assignCampaign'
  | 'businessStates'
  | 'filtered'
  | 'campaignsByAccount'
>) {
  return (
    <div className="space-y-3">
      {filtered.map((account) => {
        const accountCampaigns = campaignsByAccount.get(account.id) ?? [];
        const isOpen = expanded === account.id;
        const businessState = account.business_name
          ? businessStates.get(account.business_name)
          : null;
        return (
          <article
            key={account.id}
            className="glass-card overflow-hidden rounded-2xl border border-border bg-muted"
          >
            <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1.5fr_1fr_1fr_1fr_auto] xl:items-center">
              <div className="flex items-start gap-3">
                <HealthRing score={account.health_score} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-semibold text-foreground">{account.name}</h2>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-1 text-[10px] uppercase tracking-wider',
                        statusTone[account.operational_state],
                      )}
                    >
                      {statusCopy[account.operational_state]}
                    </span>
                    {businessState?.off && (
                      <span className="rounded-full border border-danger/25 bg-danger/[0.08] px-2 py-1 text-[10px] uppercase tracking-wider text-danger">
                        BM sem contas utilizáveis
                      </span>
                    )}
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    act_{account.external_id}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Building2 className="h-3.5 w-3.5" /> {account.business_name ?? 'Conta pessoal'}
                    {businessState && (
                      <span className={businessState.off ? 'text-danger/70' : 'text-success'}>
                        · {businessState.usable}/{businessState.total} utilizável(is)
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div>
                <p className="hud-label">Gasto histórico</p>
                <p className="mt-2 font-mono text-lg text-foreground">
                  {money(account.amount_spent_minor, account.currency)}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  30 dias: {money(account.spend_30d_minor, account.currency)}
                </p>
                {account.operational_state === 'unsettled' && (
                  <div className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-warning">
                      Pendência informada
                    </p>
                    <p className="mt-1 font-mono text-base text-warning">
                      {money(account.balance_minor, account.currency)}
                    </p>
                    {Number(account.balance_minor) === 0 && (
                      <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
                        A Meta sinalizou a conta, mas retornou saldo financeiro zero.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <p className="hud-label">Operação</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  {account.campaigns_active} ativa(s) · {account.campaigns_total} total
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {Number(account.impressions_30d).toLocaleString('pt-BR')} impressões
                </p>
              </div>
              <div>
                <p className="hud-label">Oferta principal</p>
                <select
                  aria-label={`Oferta da conta ${account.name}`}
                  value={account.primary_offer_id ?? ''}
                  onChange={(event) =>
                    assignAccount.mutate({
                      accountId: account.id,
                      offerId: event.target.value || null,
                    })
                  }
                  className="mt-2 h-10 w-full rounded-lg border border-border bg-bg-elevated px-3 text-sm text-foreground"
                >
                  <option value="">Não associada</option>
                  {(dashboard.data?.offers ?? []).map((offer) => (
                    <option key={offer.id} value={offer.id}>
                      {offer.name}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : account.id)}
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-3 text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4" />
                ) : (
                  <ChevronRight className="h-4 w-4" />
                )}{' '}
                Campanhas
              </button>
            </div>
            {isOpen && (
              <div className="border-t border-border bg-accent p-4 sm:p-5">
                <div className="space-y-2">
                  {accountCampaigns.length ? (
                    accountCampaigns.map((campaign) => (
                      <div
                        key={campaign.id}
                        className="glass-card grid gap-3 rounded-xl border border-border bg-muted p-3 md:grid-cols-[1fr_auto_240px] md:items-center"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-foreground">{campaign.name}</p>
                          <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                            {campaign.external_id}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'w-fit rounded-full border px-2 py-1 text-[10px]',
                            campaign.effective_status === 'ACTIVE'
                              ? 'border-success/30 text-success'
                              : 'border-border text-muted-foreground',
                          )}
                        >
                          {campaign.effective_status ?? campaign.configured_status ?? '—'}
                        </span>
                        <select
                          aria-label={`Oferta da campanha ${campaign.name}`}
                          value={campaign.offer_id ?? account.primary_offer_id ?? ''}
                          onChange={(event) =>
                            assignCampaign.mutate({
                              campaignId: campaign.id,
                              offerId: event.target.value || null,
                            })
                          }
                          className="h-9 rounded-lg border border-border bg-bg-elevated px-3 text-xs text-foreground"
                        >
                          <option value="">Herdar / sem oferta</option>
                          {(dashboard.data?.offers ?? []).map((offer) => (
                            <option key={offer.id} value={offer.id}>
                              {offer.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))
                  ) : (
                    <p className="py-5 text-center text-sm text-muted-foreground">
                      Nenhuma campanha encontrada.
                    </p>
                  )}
                </div>
              </div>
            )}
          </article>
        );
      })}
      {!filtered.length && (
        <div className="glass-card rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Nenhuma conta encontrada para estes filtros.
        </div>
      )}
    </div>
  );
}
