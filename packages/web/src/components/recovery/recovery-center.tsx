'use client';

import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  ChevronDown,
  GitBranch,
  RefreshCw,
  Settings2,
  Webhook,
  X,
} from 'lucide-react';
import { renderRecoveryActivity } from './recovery-center-render-recovery-activity';
import { renderRecoveryQueue } from './recovery-center-render-recovery-queue';
import { renderRecoverySettings } from './recovery-center-render-recovery-settings';
import { useRecoveryCenterState } from './recovery-center-use-recovery-center-state';

export function RecoveryCenter() {
  const {
    offerId,
    setOfferId,
    offers,
    recovery,
    checkoutUrl,
    senderName,
    setSenderName,
    resendKey,
    setResendKey,
    fromEmail,
    setFromEmail,
    testEmail,
    setTestEmail,
    emailSubject,
    setEmailSubject,
    emailMessage,
    setEmailMessage,
    previewOpen,
    setPreviewOpen,
    activityFilter,
    setActivityFilter,
    settings,
    channel,
    sync,
    send,
    bulk,
    emailWebhook,
    testSend,
    configured,
    r,
    emailConfigured,
    trackingReady,
    readyToSend,
    emailOpportunities,
  } = useRecoveryCenterState();

  if (recovery.isError)
    return (
      <div className="glass-card flex min-h-64 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm font-semibold text-white">Não foi possível carregar o TMX Recovery</p>
        <p className="max-w-lg text-xs leading-5 text-white/45">
          {recovery.error instanceof Error
            ? recovery.error.message
            : 'A API de recuperação não respondeu.'}
        </p>
        <Button
          variant="outline"
          disabled={recovery.isFetching}
          onClick={() => void recovery.refetch()}
        >
          <RefreshCw className={recovery.isFetching ? 'animate-spin' : ''} />
          Tentar novamente
        </Button>
      </div>
    );
  return (
    <div className="space-y-6">
      <header className="tmx-command-hero rounded-2xl border border-cyan-300/15 p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="hud-label">TMX Revenue Recovery</p>
              <span className="rounded-full border border-cyan-300/20 bg-cyan-300/[0.06] px-2.5 py-1 text-[8px] uppercase tracking-[0.18em] text-cyan-200">
                E-mail only
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-white">
              Recuperação de vendas
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/50">
              Transforme abandonos e pagamentos recusados em uma fila rastreável de receita
              recuperada.
            </p>
          </div>
          <div className="flex min-w-full gap-2 sm:min-w-[380px]">
            <div className="relative flex-1">
              <select
                aria-label="Selecionar oferta"
                value={offerId}
                onChange={(e) => setOfferId(e.target.value)}
                className="h-11 w-full appearance-none rounded-lg border border-cyan-100/[0.14] bg-[#06151e] px-4 pr-10 text-sm text-white"
              >
                {(offers.data ?? []).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-white/35" />
            </div>
            <Button
              variant="outline"
              aria-label="Atualizar Recovery"
              disabled={recovery.isFetching}
              onClick={() => void recovery.refetch()}
            >
              <RefreshCw className={recovery.isFetching ? 'animate-spin' : ''} />
            </Button>
          </div>
        </div>
      </header>
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-5">
        {[
          ['Elegíveis', r?.totals.eligible ?? 0],
          ['E-mails enviados', r?.email_metrics?.sent ?? 0],
          ['Taxa de abertura', `${Math.round((r?.email_metrics?.open_rate ?? 0) * 100)}%`],
          ['Vendas recuperadas', r?.totals.recovered ?? 0],
          [
            'Receita recuperada',
            `R$ ${(Number(r?.totals.recovered_minor ?? 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
          ],
        ].map(([label, value]) => (
          <div
            key={label}
            className="tmx-kpi-card min-w-0 rounded-xl border border-white/[0.08] p-4"
          >
            <p className="hud-label text-[9px]">{label}</p>
            <p className="mono-num mt-3 min-w-0 break-words text-base text-white xl:text-xl">
              {value}
            </p>
          </div>
        ))}
      </section>
      <section className="glass-card p-5">
        <div className="flex items-center gap-3">
          <Settings2 className="h-4 w-4 text-cyan-300" />
          <div>
            <p className="hud-label">Fontes automáticas</p>
            <p className="mt-1 text-xs text-white/40">
              O Recovery cruza o clique de entrada com o webhook original da Vendepay e o checkout
              do teste A/B.
            </p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
            <div className="flex items-center gap-2 text-sm text-white/75">
              <Webhook className="h-4 w-4 text-emerald-300" />
              Webhooks Vendepay
            </div>
            <p className="mt-2 font-mono text-xs text-white/45">
              {r?.sources.gateway_enabled
                ? `${r.sources.vendepay_webhooks ?? 0} recebido(s) em 30 dias`
                : 'Não conectado'}
            </p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
            <div className="flex items-center gap-2 text-sm text-white/75">
              <GitBranch className="h-4 w-4 text-cyan-300" />
              Link de entrada + A/B
            </div>
            <p className="mt-2 truncate font-mono text-xs text-white/45">{`${r?.sources.entry_clicks ?? 0} clique(s) · ${r?.sources.ab_test || `${r?.sources.checkout_destinations ?? r?.sources.ab_destinations ?? 0} checkout(s) detectado(s)`}`}</p>
          </div>
          <div className="rounded-xl border border-white/[0.07] bg-black/10 p-4">
            <div className="flex items-center gap-2 text-sm text-white/75">
              <CheckCircle2
                className={`h-4 w-4 ${r?.sources.automatic ? 'text-emerald-300' : 'text-amber-300'}`}
              />
              Cruzamento
            </div>
            <p className="mt-2 font-mono text-xs text-white/45">
              {r?.sources.automatic ? 'Webhook + jornada + checkout' : 'Falta gateway ou destino'}
            </p>
          </div>
        </div>
      </section>
      {renderRecoverySettings({
        recovery,
        checkoutUrl,
        senderName,
        setSenderName,
        resendKey,
        setResendKey,
        fromEmail,
        setFromEmail,
        testEmail,
        setTestEmail,
        emailSubject,
        setEmailSubject,
        emailMessage,
        setEmailMessage,
        setPreviewOpen,
        settings,
        channel,
        sync,
        emailWebhook,
        testSend,
        configured,
        r,
        emailConfigured,
        trackingReady,
        readyToSend,
      })}
      {renderRecoveryActivity({ activityFilter, setActivityFilter, channel, r })}
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="hud-label">Performance de e-mail</p>
            <p className="mt-1 text-xs text-white/40">
              Entrega reconciliada com a Resend; abertura e clique medidos pelo TMX; conversão e
              receita confirmadas pela Vendepay.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-7">
          {[
            ['Enviados', r?.email_metrics?.sent ?? 0],
            ['Entregues', r?.email_metrics?.delivered ?? 0],
            ['Abertos', r?.email_metrics?.opened ?? 0],
            ['Taxa abertura', `${Math.round((r?.email_metrics?.open_rate ?? 0) * 100)}%`],
            ['Taxa de cliques', `${Math.round((r?.email_metrics?.click_rate ?? 0) * 100)}%`],
            [
              'Conversões',
              `${r?.email_metrics?.converted ?? 0} · ${Math.round((r?.email_metrics?.conversion_rate ?? 0) * 100)}%`,
            ],
            [
              'Valor recuperado',
              `R$ ${(Number(r?.email_metrics?.recovered_minor ?? 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            ],
          ].map(([label, value]) => (
            <div
              key={label}
              className="min-w-0 rounded-xl border border-white/[0.07] bg-black/10 p-3"
            >
              <p className="hud-label text-[8px]">{label}</p>
              <p className="mono-num mt-2 min-w-0 break-words text-base text-white xl:text-lg">
                {value}
              </p>
            </div>
          ))}
        </div>
      </section>
      {renderRecoveryQueue({
        checkoutUrl,
        settings,
        sync,
        send,
        bulk,
        r,
        emailConfigured,
        emailOpportunities,
      })}
      {previewOpen && (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/80 p-4">
          <div className="flex h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-cyan-300/20 bg-[#071720]">
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div>
                <p className="hud-label">Preview do e-mail</p>
                <p className="mt-1 text-sm text-white/70">{emailSubject}</p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => setPreviewOpen(false)}>
                <X />
                Fechar
              </Button>
            </div>
            <iframe
              title="Pré-visualização do e-mail"
              sandbox=""
              className="h-full w-full bg-white"
              srcDoc={emailMessage
                .replaceAll('{{nome}}', 'Maria')
                .replaceAll('{{link}}', 'https://theminex.com/recovery-preview')}
            />
          </div>
        </div>
      )}
    </div>
  );
}
