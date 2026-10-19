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
            className="overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.022]"
          >
            <div className="grid gap-4 p-4 sm:p-5 xl:grid-cols-[1.5fr_1fr_1fr_1fr_auto] xl:items-center">
              <div className="flex items-start gap-3">
                <HealthRing score={account.health_score} />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate font-semibold text-white">{account.name}</h2>
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
                  <p className="mt-1 font-mono text-[11px] text-white/35">
                    act_{account.external_id}
                  </p>
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-white/45">
                    <Building2 className="h-3.5 w-3.5" /> {account.business_name ?? 'Conta pessoal'}
                    {businessState && (
                      <span
                        className={businessState.off ? 'text-danger/70' : 'text-emerald-200/60'}
                      >
                        · {businessState.usable}/{businessState.total} utilizável(is)
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <div>
                <p className="hud-label">Gasto histórico</p>
                <p className="mt-2 font-mono text-lg text-white">
                  {money(account.amount_spent_minor, account.currency)}
                </p>
                <p className="mt-1 text-xs text-white/35">
                  30 dias: {money(account.spend_30d_minor, account.currency)}
                </p>
                {account.operational_state === 'unsettled' && (
                  <div className="mt-3 rounded-lg border border-amber-300/15 bg-amber-300/[0.06] px-3 py-2">
                    <p className="text-[10px] uppercase tracking-[0.14em] text-amber-200/55">
                      Pendência informada
                    </p>
                    <p className="mt-1 font-mono text-base text-amber-100">
                      {money(account.balance_minor, account.currency)}
                    </p>
                    {Number(account.balance_minor) === 0 && (
                      <p className="mt-1 text-[10px] leading-4 text-white/35">
                        A Meta sinalizou a conta, mas retornou saldo financeiro zero.
                      </p>
                    )}
                  </div>
                )}
              </div>
              <div>
                <p className="hud-label">Operação</p>
                <p className="mt-2 text-sm text-white/70">
                  {account.campaigns_active} ativa(s) · {account.campaigns_total} total
                </p>
                <p className="mt-1 text-xs text-white/35">
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
                  className="mt-2 h-10 w-full rounded-lg border border-white/10 bg-bg-elevated px-3 text-sm text-white"
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
                className="flex h-10 items-center justify-center gap-2 rounded-lg border border-white/10 px-3 text-xs text-white/50 hover:bg-white/[0.04] hover:text-white"
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
              <div className="border-t border-white/[0.07] bg-black/10 p-4 sm:p-5">
                <div className="space-y-2">
                  {accountCampaigns.length ? (
                    accountCampaigns.map((campaign) => (
                      <div
                        key={campaign.id}
                        className="grid gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3 md:grid-cols-[1fr_auto_240px] md:items-center"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm text-white/75">{campaign.name}</p>
                          <p className="mt-1 font-mono text-[10px] text-white/30">
                            {campaign.external_id}
                          </p>
                        </div>
                        <span
                          className={cn(
                            'w-fit rounded-full border px-2 py-1 text-[10px]',
                            campaign.effective_status === 'ACTIVE'
                              ? 'border-emerald-300/15 text-emerald-200'
                              : 'border-white/10 text-white/35',
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
                          className="h-9 rounded-lg border border-white/10 bg-bg-elevated px-3 text-xs text-white"
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
                    <p className="py-5 text-center text-sm text-white/35">
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
        <div className="rounded-2xl border border-dashed border-white/10 p-12 text-center text-sm text-white/35">
          Nenhuma conta encontrada para estes filtros.
        </div>
      )}
    </div>
  );
}
