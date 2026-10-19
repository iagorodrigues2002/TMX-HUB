'use client';

import { Button } from '@/components/ui/button';
import { Mail, RefreshCw, Send, ShoppingBag } from 'lucide-react';
import type { useRecoveryCenterState } from './recovery-center-use-recovery-center-state';

export function renderRecoveryQueue({
  checkoutUrl,
  settings,
  sync,
  send,
  bulk,
  r,
  emailConfigured,
  emailOpportunities,
}: Pick<
  ReturnType<typeof useRecoveryCenterState>,
  | 'checkoutUrl'
  | 'settings'
  | 'sync'
  | 'send'
  | 'bulk'
  | 'r'
  | 'emailConfigured'
  | 'emailOpportunities'
>) {
  return (
    <section className="glass-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="hud-label">Fila de recuperação</p>
          <p className="mt-1 text-xs text-white/40">
            Compradores aptos para receber o e-mail. O TMX usa automaticamente o checkout A/B
            correto.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {r?.settings?.email_automation_enabled && (
            <span className="inline-flex items-center rounded-lg border border-emerald-300/20 bg-emerald-300/[0.07] px-3 text-[10px] font-medium text-emerald-200">
              Automação ativa · envio em {r.settings.email_delay_minutes} min
            </span>
          )}
          {emailConfigured && (
            <Button
              disabled={bulk.isPending}
              onClick={() =>
                window.confirm(
                  'Enviar o e-mail configurado para todas as oportunidades elegíveis que ainda não receberam?',
                ) && bulk.mutate()
              }
            >
              <Mail />
              Enviar e-mails em massa
            </Button>
          )}
          <Button
            variant="outline"
            disabled={sync.isPending || (!r?.sources.automatic && !checkoutUrl)}
            onClick={() => sync.mutate()}
          >
            <RefreshCw className={sync.isPending ? 'animate-spin' : ''} />
            Sincronizar dados TMX
          </Button>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {emailOpportunities.map((o) => (
          <article
            key={o.id}
            className="flex flex-col gap-3 rounded-xl border border-white/[0.07] bg-black/10 p-4 lg:flex-row lg:items-center"
          >
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-amber-300/15 text-amber-300">
              <ShoppingBag className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-medium text-white/85">
                  {o.buyer_name || 'Comprador não identificado'}
                </p>
                <span className="rounded border border-white/[0.08] px-2 py-0.5 font-mono text-[8px] uppercase text-white/40">
                  {o.status}
                </span>
                <span className="rounded border border-amber-300/10 px-2 py-0.5 text-[9px] text-amber-200/60">
                  {o.reason}
                </span>
                {o.email_opened_at ? (
                  <span className="rounded border border-emerald-300/15 px-2 py-0.5 text-[9px] text-emerald-300">
                    E-mail aberto
                  </span>
                ) : o.email_delivered_at ? (
                  <span className="rounded border border-cyan-300/15 px-2 py-0.5 text-[9px] text-cyan-300">
                    Entregue · não aberto
                  </span>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-white/40">
                {o.product?.name || o.external_id} · {o.email || 'sem e-mail'} ·{' '}
                {o.phone || 'sem telefone'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {emailConfigured && o.has_email && (
                <Button size="sm" disabled={send.isPending} onClick={() => send.mutate(o.id)}>
                  <Send />
                  Enviar e-mail
                </Button>
              )}
            </div>
          </article>
        ))}
        {!emailOpportunities.length && (
          <div className="rounded-xl border border-dashed border-white/[0.08] p-8 text-center text-sm text-white/35">
            Nenhuma oportunidade pendente de envio. Novos abandonos aparecerão após a sincronização
            do Tracking Avançado.
          </div>
        )}
      </div>
    </section>
  );
}
