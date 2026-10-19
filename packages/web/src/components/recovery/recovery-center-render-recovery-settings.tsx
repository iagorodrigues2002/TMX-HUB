'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CheckCircle2, Eye, Mail, RefreshCw, Send, Webhook } from 'lucide-react';
import type { useRecoveryCenterState } from './recovery-center-use-recovery-center-state';

export function renderRecoverySettings({
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
}: Pick<
  ReturnType<typeof useRecoveryCenterState>,
  | 'recovery'
  | 'checkoutUrl'
  | 'senderName'
  | 'setSenderName'
  | 'resendKey'
  | 'setResendKey'
  | 'fromEmail'
  | 'setFromEmail'
  | 'testEmail'
  | 'setTestEmail'
  | 'emailSubject'
  | 'setEmailSubject'
  | 'emailMessage'
  | 'setEmailMessage'
  | 'setPreviewOpen'
  | 'settings'
  | 'channel'
  | 'sync'
  | 'emailWebhook'
  | 'testSend'
  | 'configured'
  | 'r'
  | 'emailConfigured'
  | 'trackingReady'
  | 'readyToSend'
>) {
  return (
    <section className="grid gap-4 xl:grid-cols-[0.72fr_1.28fr]">
      <div className="glass-card p-5 sm:p-6">
        <p className="hud-label">Ativação</p>
        <h2 className="mt-2 text-xl font-semibold text-white">Seu Recovery por e-mail</h2>
        <p className="mt-2 text-sm leading-6 text-white/45">
          Configure uma vez. O TMX identifica as oportunidades, cria o link rastreável e atribui a
          compra automaticamente.
        </p>
        <div className="mt-6 space-y-3">
          {[
            ['1', 'Tracking conectado', trackingReady, 'Vendepay e checkout detectados'],
            ['2', 'Remetente configurado', emailConfigured, 'Resend, domínio e conteúdo'],
            ['3', 'Pronto para recuperar', readyToSend, 'Envio individual ou em massa'],
          ].map(([step, title, done, description]) => (
            <div
              key={String(step)}
              className={`flex gap-3 rounded-xl border p-4 ${
                done
                  ? 'border-emerald-300/15 bg-emerald-300/[0.04]'
                  : 'border-white/[0.07] bg-black/10'
              }`}
            >
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full border font-mono text-xs ${
                  done ? 'border-emerald-300/30 text-emerald-300' : 'border-white/10 text-white/35'
                }`}
              >
                {done ? <CheckCircle2 className="h-4 w-4" /> : step}
              </span>
              <div>
                <p className="text-sm font-medium text-white/80">{title}</p>
                <p className="mt-1 text-[11px] text-white/35">{description}</p>
              </div>
            </div>
          ))}
        </div>
        <Button
          className="mt-5 w-full"
          variant="outline"
          disabled={sync.isPending || (!r?.sources.automatic && !checkoutUrl)}
          onClick={() => sync.mutate()}
        >
          <RefreshCw className={sync.isPending ? 'animate-spin' : ''} />
          Buscar novas oportunidades
        </Button>
      </div>
      <div className="glass-card p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-lg border border-cyan-300/15 bg-cyan-300/[0.06]">
              <Mail className="h-4 w-4 text-cyan-300" />
            </span>
            <div>
              <p className="font-semibold">Configuração do e-mail</p>
              <p className="mt-0.5 text-[11px] text-white/35">Envio seguro pelo Resend</p>
            </div>
          </div>
          <span
            className={`rounded-full border px-3 py-1 text-[9px] uppercase tracking-wider ${
              emailConfigured
                ? 'border-emerald-300/20 text-emerald-300'
                : 'border-amber-300/20 text-amber-200'
            }`}
          >
            {emailConfigured ? 'Configurado' : 'Configuração pendente'}
          </span>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <div>
            <Label>Nome do remetente</Label>
            <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} />
            <p className="mt-1 text-[10px] text-white/30">Nome exibido para o comprador.</p>
          </div>
          <div>
            <Label>Chave da API Resend</Label>
            <Input
              type="password"
              value={resendKey}
              onChange={(e) => setResendKey(e.target.value)}
              placeholder={emailConfigured ? 'Chave já salva' : 're_...'}
            />
            <p className="mt-1 text-[10px] text-white/30">
              {emailConfigured
                ? 'Deixe vazio para manter a chave atual.'
                : 'Necessária apenas na primeira configuração.'}
            </p>
          </div>
          <div>
            <Label>E-mail remetente</Label>
            <Input
              value={fromEmail}
              onChange={(e) => setFromEmail(e.target.value)}
              placeholder="TMX <vendas@dominio.com>"
            />
            <p className="mt-1 text-[10px] text-white/30">Use um domínio verificado no Resend.</p>
          </div>
        </div>
        <div className="mt-4 space-y-3">
          <Label>Assunto</Label>
          <Input
            value={emailSubject}
            onChange={(e) => setEmailSubject(e.target.value)}
            placeholder="Assunto do e-mail"
          />
          <textarea
            aria-label="Conteúdo do e-mail"
            value={emailMessage}
            onChange={(e) => setEmailMessage(e.target.value)}
            maxLength={100000}
            rows={9}
            className="w-full rounded-xl border border-white/10 bg-black/15 p-4 font-mono text-xs leading-5 text-white outline-none focus:border-cyan-300/30"
          />
          <div className="flex items-center justify-between gap-3 text-[10px] text-white/30">
            <p>
              Aceita HTML e as variáveis {'{{nome}}'} e {'{{link}}'}.
            </p>
            <span className="font-mono">
              {emailMessage.length.toLocaleString('pt-BR')} / 100.000
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-[auto_auto_1fr]">
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              <Eye />
              Ver preview
            </Button>
            <Button
              variant="outline"
              disabled={!configured('email') || emailWebhook.isPending}
              onClick={() => emailWebhook.mutate()}
            >
              <Webhook />
              Ativar métricas
            </Button>
            <Button
              disabled={
                (!emailConfigured && (!resendKey || !fromEmail)) ||
                emailSubject.length < 3 ||
                emailMessage.length < 10 ||
                channel.isPending
              }
              onClick={() => {
                settings.mutate();
                channel.mutate({
                  kind: 'email',
                  enabled: true,
                  credentials: {
                    ...(resendKey ? { api_key: resendKey } : {}),
                    ...(fromEmail ? { from_email: fromEmail } : {}),
                  },
                  config: { subject: emailSubject, message: emailMessage },
                });
              }}
            >
              <CheckCircle2 />
              Salvar configuração
            </Button>
          </div>
          <div className="rounded-xl border border-cyan-300/10 bg-cyan-300/[0.03] p-4">
            <div className="flex items-start gap-3">
              <Mail className="mt-0.5 h-4 w-4 text-cyan-300" />
              <div>
                <p className="text-sm font-medium text-white/80">Enviar um teste</p>
                <p className="mt-1 text-[11px] text-white/35">
                  É enviado exatamente como o lead receberá e abre o checkout real. O resultado fica
                  separado das métricas de venda.
                </p>
              </div>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
              <Input
                type="email"
                aria-label="Destinatário do e-mail teste"
                value={testEmail}
                onChange={(event) => setTestEmail(event.target.value)}
                placeholder="seuemail@dominio.com"
              />
              <Button
                variant="outline"
                disabled={
                  !emailConfigured || !/^\S+@\S+\.\S+$/.test(testEmail.trim()) || testSend.isPending
                }
                onClick={() => testSend.mutate()}
              >
                <Send className={testSend.isPending ? 'animate-pulse' : ''} />
                {testSend.isPending ? 'Enviando...' : 'Enviar teste'}
              </Button>
            </div>
            {!emailConfigured && (
              <p className="mt-2 text-[10px] text-amber-200/60">
                Salve a configuração do e-mail antes de enviar o primeiro teste.
              </p>
            )}
            {(r?.test_runs ?? []).length > 0 && (
              <div className="mt-4 space-y-2 border-t border-white/[0.07] pt-4">
                <div className="flex items-center justify-between">
                  <p className="hud-label text-[8px]">Últimos testes</p>
                  <Button size="sm" variant="ghost" onClick={() => void recovery.refetch()}>
                    <RefreshCw className={recovery.isFetching ? 'animate-spin' : ''} />
                    Atualizar
                  </Button>
                </div>
                {(r?.test_runs ?? []).slice(0, 3).map((run) => (
                  <div
                    key={run.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-white/[0.06] bg-black/10 px-3 py-2"
                  >
                    <div>
                      <p className="text-xs text-white/65">{run.recipient}</p>
                      <p className="mt-0.5 text-[9px] text-white/25">
                        {new Date(run.created_at).toLocaleString('pt-BR')}
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      <span className="rounded border border-emerald-300/15 px-2 py-1 text-[8px] uppercase text-emerald-300">
                        Enviado
                      </span>
                      <span
                        className={`rounded border px-2 py-1 text-[8px] uppercase ${
                          run.open_count > 0
                            ? 'border-emerald-300/20 text-emerald-300'
                            : 'border-white/[0.07] text-white/25'
                        }`}
                      >
                        {run.open_count > 0 ? `${run.open_count} abertura(s)` : 'Não aberto'}
                      </span>
                      <span
                        className={`rounded border px-2 py-1 text-[8px] uppercase ${
                          run.click_count > 0
                            ? 'border-cyan-300/20 text-cyan-300'
                            : 'border-white/[0.07] text-white/25'
                        }`}
                      >
                        {run.click_count > 0 ? `${run.click_count} clique(s)` : 'Aguardando clique'}
                      </span>
                      <span
                        className={`rounded border px-2 py-1 text-[8px] uppercase ${
                          run.checkout_count > 0
                            ? 'border-violet-300/20 text-violet-300'
                            : 'border-white/[0.07] text-white/25'
                        }`}
                      >
                        {run.checkout_count > 0
                          ? `${run.checkout_count} checkout(s)`
                          : 'Checkout pendente'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
