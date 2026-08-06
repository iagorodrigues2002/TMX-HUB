'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type OfferView, apiClient } from '@/lib/api-client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  ChevronDown,
  Clock3,
  Eye,
  GitBranch,
  Mail,
  MousePointerClick,
  RefreshCw,
  Send,
  Settings2,
  ShoppingBag,
  Webhook,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

export function RecoveryCenter() {
  const qc = useQueryClient();
  const [offerId, setOfferId] = useState('');
  const offers = useQuery<OfferView[]>({
    queryKey: ['offers'],
    queryFn: () => apiClient.listOffers(),
  });
  useEffect(() => {
    if (!offerId && offers.data?.[0]) setOfferId(offers.data[0].id);
  }, [offerId, offers.data]);
  const recovery = useQuery({
    queryKey: ['recovery', offerId],
    queryFn: () => apiClient.getRecovery(offerId),
    enabled: Boolean(offerId),
    refetchInterval: 30000,
  });
  const [checkoutUrl, setCheckoutUrl] = useState('');
  const [senderName, setSenderName] = useState('TMX');
  const [resendKey, setResendKey] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [testEmail, setTestEmail] = useState('');
  const [emailSubject, setEmailSubject] = useState('Sua compra ainda está disponível');
  const [emailMessage, setEmailMessage] = useState(
    '<p>Olá {{nome}},</p><p>notamos que sua compra não foi concluída.</p><p>{{link}}</p>',
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [activityFilter, setActivityFilter] = useState<'all' | 'opened' | 'clicked' | 'converted'>(
    'all',
  );
  useEffect(() => {
    if (recovery.data?.settings) {
      setCheckoutUrl(recovery.data.settings.checkout_url || '');
      setSenderName(recovery.data.settings.sender_name || 'TMX');
    }
  }, [recovery.data?.settings]);
  useEffect(() => {
    const email = recovery.data?.channels.find((item) => item.kind === 'email');
    if (!email) return;
    setFromEmail(email.from_email || '');
    if (email.config.subject) setEmailSubject(email.config.subject);
    if (email.config.message) setEmailMessage(email.config.message);
  }, [recovery.data?.channels]);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['recovery', offerId] });
  const settings = useMutation({
    mutationFn: () =>
      apiClient.updateRecoverySettings(offerId, {
        checkout_url: checkoutUrl,
        sender_name: senderName,
        quiet_start: 21,
        quiet_end: 8,
        enabled: true,
      }),
    onSuccess: () => {
      toast.success('Configuração de recuperação salva.');
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const channel = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiClient.updateRecoveryChannel(offerId, body),
    onSuccess: (result) => {
      toast.success(
        result.webhook_configured
          ? 'Canal salvo e métricas ativadas.'
          : 'Canal salvo com criptografia.',
      );
      if (result.webhook_error)
        toast.warning('Canal salvo, mas o webhook de métricas precisa ser ativado.');
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const sync = useMutation({
    mutationFn: () => apiClient.syncRecovery(offerId),
    onSuccess: (r) => {
      toast.success(
        `${r.created} nova(s) oportunidade(s) criada(s) · ${r.candidates - r.skipped} com checkout resolvido.`,
      );
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const send = useMutation({
    mutationFn: (id: string) => apiClient.sendRecovery(offerId, id, 'email'),
    onSuccess: () => {
      toast.success('Recuperação enviada.');
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const bulk = useMutation({
    mutationFn: () => apiClient.bulkSendRecovery(offerId, 'email'),
    onSuccess: (r) => {
      toast.success(`${r.sent} enviada(s) · ${r.failed} falha(s).`);
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const emailWebhook = useMutation({
    mutationFn: () => apiClient.setupRecoveryEmailWebhook(offerId),
    onSuccess: () => {
      toast.success('Métricas de e-mail ativadas.');
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const testSend = useMutation({
    mutationFn: () =>
      apiClient.sendRecoveryTestEmail(offerId, {
        to: testEmail.trim(),
        subject: emailSubject,
        message: emailMessage,
      }),
    onSuccess: () => {
      toast.success(`E-mail teste enviado para ${testEmail.trim()}.`);
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const configured = (kind: string) =>
    recovery.data?.channels.some((c) => c.kind === kind && c.enabled);
  const r = recovery.data;
  const emailConfigured = Boolean(configured('email'));
  const trackingReady = Boolean(r?.sources.automatic);
  const readyToSend = emailConfigured && trackingReady;
  const emailOpportunities = (r?.opportunities ?? []).filter((item) => item.has_email);
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
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
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
          <div key={label} className="tmx-kpi-card rounded-xl border border-white/[0.08] p-4">
            <p className="hud-label text-[9px]">{label}</p>
            <p className="mono-num mt-3 text-xl text-white">{value}</p>
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
                    done
                      ? 'border-emerald-300/30 text-emerald-300'
                      : 'border-white/10 text-white/35'
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
                    É enviado exatamente como o lead receberá e abre o checkout real. O resultado
                    fica separado das métricas de venda.
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
                    !emailConfigured ||
                    !/^\S+@\S+\.\S+$/.test(testEmail.trim()) ||
                    testSend.isPending
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
                            run.clicked_at
                              ? 'border-cyan-300/20 text-cyan-300'
                              : 'border-white/[0.07] text-white/25'
                          }`}
                        >
                          {run.clicked_at ? 'Clique ✓' : 'Aguardando clique'}
                        </span>
                        <span
                          className={`rounded border px-2 py-1 text-[8px] uppercase ${
                            run.checkout_at
                              ? 'border-violet-300/20 text-violet-300'
                              : 'border-white/[0.07] text-white/25'
                          }`}
                        >
                          {run.checkout_at ? 'Checkout ✓' : 'Checkout pendente'}
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
      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="glass-card overflow-hidden p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="hud-label">Conversões atribuídas ao Recovery</p>
              <p className="mt-1 text-xs text-white/40">
                Cada compra abaixo possui uma mensagem e um clique TMX comprovados.
              </p>
            </div>
            <span className="rounded-full border border-emerald-300/15 bg-emerald-300/[0.06] px-3 py-1 font-mono text-xs text-emerald-300">
              {r?.conversions.length ?? 0} conversão(ões)
            </span>
          </div>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="border-b border-white/[0.08] text-[9px] uppercase tracking-[0.16em] text-white/35">
                <tr>
                  <th className="pb-3 font-medium">Comprador / produto</th>
                  <th className="pb-3 font-medium">Canal</th>
                  <th className="pb-3 font-medium">Jornada</th>
                  <th className="pb-3 text-right font-medium">Recuperado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {(r?.conversions ?? []).map((conversion) => (
                  <tr key={conversion.opportunity_id}>
                    <td className="py-3 pr-4">
                      <p className="font-medium text-white/80">
                        {conversion.buyer_name || conversion.email || 'Comprador identificado'}
                      </p>
                      <p className="mt-1 text-[10px] text-white/35">
                        {conversion.product?.name || conversion.recovered_external_id}
                      </p>
                    </td>
                    <td className="py-3 font-mono text-cyan-200/70">
                      {conversion.recovered_channel || 'link anterior'}
                    </td>
                    <td className="py-3 text-[10px] text-white/40">
                      <span className={conversion.opened_at ? 'text-emerald-300' : ''}>abriu</span>
                      {' → '}
                      <span className={conversion.clicked_at ? 'text-emerald-300' : ''}>
                        clicou
                      </span>
                      {' → '}
                      <span className="text-emerald-300">comprou</span>
                    </td>
                    <td className="py-3 text-right">
                      <p className="font-mono text-sm text-emerald-300">
                        R${' '}
                        {(Number(conversion.recovered_minor) / 100).toLocaleString('pt-BR', {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                      <p className="mt-1 text-[9px] text-white/30">
                        {new Date(conversion.recovered_at).toLocaleString('pt-BR')}
                      </p>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!r?.conversions.length && (
              <div className="py-10 text-center text-xs text-white/30">
                As próximas compras após um clique aparecerão aqui com a origem exata.
              </div>
            )}
          </div>
        </div>
        <div className="glass-card p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="hud-label">Atividade em tempo real</p>
              <p className="mt-1 text-xs text-white/40">
                Todas as aberturas e cliques, não só o primeiro.
              </p>
            </div>
            <div className="flex flex-wrap gap-1">
              {(['all', 'opened', 'clicked', 'converted'] as const).map((filter) => (
                <button
                  type="button"
                  key={filter}
                  onClick={() => setActivityFilter(filter)}
                  className={`rounded-md border px-2 py-1 text-[9px] uppercase ${
                    activityFilter === filter
                      ? 'border-cyan-300/30 bg-cyan-300/10 text-cyan-200'
                      : 'border-white/[0.07] text-white/35'
                  }`}
                >
                  {filter === 'all'
                    ? 'Tudo'
                    : filter === 'opened'
                      ? 'Aberturas'
                      : filter === 'clicked'
                        ? 'Cliques'
                        : 'Conversões'}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-4 max-h-[390px] space-y-2 overflow-y-auto pr-1">
            {(r?.activity ?? [])
              .filter((event) => activityFilter === 'all' || event.event_type === activityFilter)
              .map((event) => (
                <div
                  key={event.id}
                  className="flex gap-3 rounded-xl border border-white/[0.06] bg-black/10 p-3"
                >
                  <span className="mt-0.5 text-cyan-300">
                    {event.event_type === 'clicked' ? (
                      <MousePointerClick className="h-4 w-4" />
                    ) : (
                      <Clock3 className="h-4 w-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-medium text-white/75">
                        {event.event_type === 'opened'
                          ? 'E-mail aberto'
                          : event.event_type === 'clicked'
                            ? 'Link clicado'
                            : event.event_type === 'converted'
                              ? 'Compra recuperada'
                              : event.event_type}
                      </p>
                      <span className="font-mono text-[8px] uppercase text-white/30">
                        {event.channel}
                      </span>
                    </div>
                    <p className="mt-1 truncate text-[10px] text-white/35">
                      {event.buyer_name || event.email || event.phone || event.external_id}
                    </p>
                    <p className="mt-1 text-[9px] text-white/25">
                      {new Date(event.event_at).toLocaleString('pt-BR')}
                    </p>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </section>
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="hud-label">Performance de e-mail</p>
            <p className="mt-1 text-xs text-white/40">
              Entrega e abertura pelo Resend; clique, conversão e receita confirmados pelo link TMX
              e pela Vendepay.
            </p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-7">
          {[
            ['Enviados', r?.email_metrics?.sent ?? 0],
            ['Entregues', r?.email_metrics?.delivered ?? 0],
            ['Abertos', r?.email_metrics?.opened ?? 0],
            ['Taxa abertura', `${Math.round((r?.email_metrics?.open_rate ?? 0) * 100)}%`],
            ['Cliques', `${Math.round((r?.email_metrics?.click_rate ?? 0) * 100)}%`],
            [
              'Conversões',
              `${r?.email_metrics?.converted ?? 0} · ${Math.round((r?.email_metrics?.conversion_rate ?? 0) * 100)}%`,
            ],
            [
              'Valor recuperado',
              `R$ ${(Number(r?.email_metrics?.recovered_minor ?? 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`,
            ],
          ].map(([label, value]) => (
            <div key={label} className="rounded-xl border border-white/[0.07] bg-black/10 p-3">
              <p className="hud-label text-[8px]">{label}</p>
              <p className="mono-num mt-2 text-lg text-white">{value}</p>
            </div>
          ))}
        </div>
      </section>
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
              Nenhuma oportunidade com e-mail disponível. Sincronize os dados do Tracking Avançado.
            </div>
          )}
        </div>
      </section>
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
