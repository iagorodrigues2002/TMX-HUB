'use client';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Bot, LockKeyhole, Send, Settings2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import chatStyles from './ai-chat.module.css';
import { AiMessageContent } from './ai-message-content';

const base = '/v1/meta-control/traffic/ai';
const field =
  'w-full rounded-xl border border-border bg-accent px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary';
const card = 'rounded-2xl border border-border bg-card/75 p-5';
type Company = { id: string; name: string; canManage: boolean };
function useAiCompany(userId?: string, settings = false) {
  const client = useQueryClient();
  const key = [settings ? 'ai-settings-company' : 'ai-company', userId];
  const selected = useQuery({
    queryKey: key,
    queryFn: () => '',
    initialData: '',
    enabled: false,
    gcTime: Number.POSITIVE_INFINITY,
  });
  return {
    company: selected.data,
    query: selected.data ? `?companyId=${encodeURIComponent(selected.data)}` : '',
    select: (id: string) => client.setQueryData(key, id),
  };
}
function CompanyPicker({
  companies,
  value,
  onChange,
  disabled = false,
}: { companies?: Company[]; value?: string; onChange: (id: string) => void; disabled?: boolean }) {
  if (!companies?.length) return null;
  return (
    <div className="max-w-sm shrink-0">
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger aria-label="Empresa do assistente">
          <SelectValue placeholder="Selecionar empresa" />
        </SelectTrigger>
        <SelectContent>
          {companies.map((c) => (
            <SelectItem key={c.id} value={c.id}>
              {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
type Settings = {
  companies?: Company[];
  companyId: string;
  revision: string;
  instructions: string;
  enabled: boolean;
  configured: boolean;
  model: string;
  dailyLimitCents: number;
  consumedMicros: number;
  usageDay: string;
};
type Status = {
  companies?: Company[];
  configured: boolean;
  enabled: boolean;
  model: string;
  syncing: boolean;
  syncError?: string;
  companyId?: string;
  accessRevision?: string;
  canManage?: boolean;
  fetchedAt?: string;
  from?: string;
  to?: string;
  offers: { id: string; name: string }[];
};
type Message = {
  id: string;
  companyId: string;
  question: string;
  answer: string;
  at: string;
  fetchedAt: string;
  costMicros?: number;
  costReserved?: boolean;
  usage?: { input_tokens: number; output_tokens: number };
};

export function AiSettings() {
  const { user } = useAuth();
  const company = useAiCompany(user?.id, true);
  const [key, setKey] = useState('');
  const [instructions, setInstructions] = useState('');
  const [enabled, setEnabled] = useState(false);
  const [revision, setRevision] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [dailyLimit, setDailyLimit] = useState('5.00');
  const settings = useQuery({
    queryKey: ['ai-settings', user?.id, company.company],
    queryFn: () => request<Settings>(`${base}/settings${company.query}`),
    enabled: !!user && user.role === 'admin',
    retry: false,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (settings.data) {
      setKey('');
      setInstructions(settings.data.instructions);
      setEnabled(settings.data.enabled);
      setRevision(settings.data.revision);
      setDailyLimit((settings.data.dailyLimitCents / 100).toFixed(2));
    }
  }, [settings.data]);
  async function save(removeKey = false) {
    setBusy(true);
    setNotice('');
    try {
      const value = await request<Settings>(`${base}/settings`, {
        method: 'PUT',
        body: {
          companyId: settings.data?.companyId,
          revision,
          instructions,
          enabled: removeKey ? false : enabled,
          dailyLimitCents: Math.round(Number(dailyLimit) * 100),
          ...(removeKey ? { removeKey: true } : key ? { apiKey: key } : {}),
        },
      });
      setRevision(value.revision);
      setKey('');
      setNotice(
        removeKey
          ? 'Chave removida do TMX. Revogue também no projeto OpenAI, se necessário.'
          : 'Configuração da empresa salva.',
      );
      await settings.refetch();
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'Falha ao salvar.');
    } finally {
      setBusy(false);
    }
  }
  if (user?.role !== 'admin') return <p>Acesso restrito à Administração global.</p>;
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <Settings2 className="text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">IA da empresa</h1>
          <p className="text-sm text-muted-foreground">Chave e instruções vinculadas à empresa</p>
        </div>
      </div>
      <CompanyPicker
        companies={settings.data?.companies?.filter((c) => c.canManage)}
        value={settings.data?.companyId}
        onChange={company.select}
        disabled={busy}
      />
      <div className={card}>
        <div className="mb-5 flex items-center gap-2 text-sm text-primary">
          <LockKeyhole size={16} /> Somente leitura · Financeiro da empresa bloqueado
        </div>
        <label className="block space-y-2 text-sm">
          Chave da API OpenAI
          <input
            type="password"
            autoComplete="new-password"
            className={field}
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={
              settings.data?.configured ? 'Chave salva — preencha apenas para substituir' : 'sk-…'
            }
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Salva criptografada no servidor; nunca é devolvida ao navegador. Não use a senha do
          ChatGPT.
        </p>
        <label className="mt-6 block space-y-2 text-sm">
          Instruções para o assistente
          <textarea
            rows={9}
            maxLength={6000}
            className={field}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Ex.: responda de forma direta. Ao avaliar escala, compare CPA e ROAS e cite o período. Considere o histórico do gestor, mas diferencie observação de causa."
          />
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Estilo, critérios e contexto da operação. Estas instruções não liberam acesso financeiro
          nem permitem alterações no sistema.
        </p>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <label className="space-y-2 text-sm">
            Limite diário da empresa · US$
            <input
              type="number"
              min="0.01"
              max="100"
              step="0.01"
              className={field}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(e.target.value)}
            />
          </label>
          <div className="glass-card rounded-xl border border-border p-3 text-sm">
            <p className="text-muted-foreground">Uso estimado + reservas · hoje UTC</p>
            <p className="mt-1 font-semibold">
              US$ {((settings.data?.consumedMicros ?? 0) / 1000000).toFixed(4)}
            </p>
          </div>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          O TMX conta os tokens e reserva o custo máximo antes de gerar, respeitando a capacidade
          do modelo e o limite diário da empresa. Sem repetição automática em falhas.
          Reservas incertas são mantidas; a fatura da OpenAI é a referência final.
        </p>
        <label className="mt-6 flex items-center gap-3 text-sm">
          <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />{' '}
          Habilitar análises pela API OpenAI
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          Ao perguntar, o TMX envia à OpenAI apenas o recorte de desempenho autorizado e o histórico
          pertinente. O uso consome créditos da API.
        </p>
        <details className="mt-4 text-xs text-muted-foreground">
          <summary className="cursor-pointer">Segurança, privacidade e custos</summary>
          <div className="mt-3 space-y-2">
            <p>
              Prefira uma chave de conta de serviço de um projeto OpenAI dedicado à empresa e
              separado do live. Permita apenas geração e contagem de tokens em Responses; não use
              chave de administração.
            </p>
            <p>
              Modelo GPT‑6.1 Sol, processamento padrão: US$ 2 por milhão de tokens de entrada e US$
              10 de saída. Cache explícito sem pontos de gravação. Preços consultados em 12/11/2026;
              não incluem impostos ou cobranças de outros aplicativos.
            </p>
            <p>
              store: false não significa retenção zero: a OpenAI pode manter registros de segurança
              por até 30 dias, com exceções legais e de segurança. Dados da API não treinam modelos
              por padrão. No TMX, conversas são limitadas a 50 registros por usuário e 30 dias; o
              histórico de otimizações da empresa permanece para análise.
            </p>
            <p>
              Acesso liberado em membros e permissões da empresa. Cada pessoa consulta apenas suas
              áreas e ofertas autorizadas; conversas são privadas por usuário.
            </p>
            <a
              className="text-primary underline"
              href="https://developers.openai.com/api/docs/guides/your-data"
              target="_blank"
              rel="noreferrer"
            >
              Política oficial de dados da OpenAI
            </a>
          </div>
        </details>
        <div className="mt-6 flex flex-wrap items-center gap-4">
          <Button
            disabled={
              busy ||
              settings.isPending ||
              settings.isError ||
              !Number.isFinite(Number(dailyLimit)) ||
              Number(dailyLimit) < 0.01 ||
              Number(dailyLimit) > 100
            }
            onClick={() => void save()}
          >
            {busy ? 'Salvando…' : 'Salvar configuração'}
          </Button>
          {settings.data?.configured && (
            <Button variant="outline" disabled={busy} onClick={() => void save(true)}>
              Remover chave
            </Button>
          )}
          <Link className="text-sm text-primary" href="/assistente">
            Abrir assistente →
          </Link>
        </div>
        <output className="block mt-3 text-sm">{notice}</output>
        {settings.isError && <p role="alert">Não foi possível carregar a configuração.</p>}
      </div>
    </div>
  );
}

export function AiAssistant({ compact = false }: { compact?: boolean } = {}) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const company = useAiCompany(user?.id);
  const conversation = useRef<HTMLDivElement>(null);
  const followLatest = useRef(true);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const status = useQuery({
    queryKey: ['ai-status', user?.id, company.company],
    queryFn: () => request<Status>(`${base}/status${company.query}`),
    enabled: !!user,
    retry: false,
    refetchInterval: 20000,
  });
  const activeIdentity = useRef('');
  activeIdentity.current = `${user?.id}:${status.data?.companyId}:${status.data?.accessRevision}:${status.isError}`;
  const historyKey = ['ai-history', user?.id, status.data?.companyId, status.data?.accessRevision];
  const history = useQuery({
    queryKey: historyKey,
    queryFn: () =>
      request<{ items: Message[]; accessRevision: string }>(
        `${base}/history?companyId=${encodeURIComponent(status.data!.companyId!)}`,
      ),
    enabled: !!status.data?.accessRevision && !status.isError,
    retry: false,
    refetchInterval: 20000,
  });
  const messages =
    !status.isError &&
    !history.isError &&
    history.data?.accessRevision === status.data?.accessRevision
      ? [...(history.data?.items ?? [])]
          .filter((m) => m.companyId === status.data?.companyId)
          .reverse()
      : [];
  // biome-ignore lint/correctness/useExhaustiveDependencies: Clear drafts on any identity or permission transition.
  useEffect(() => {
    followLatest.current = true;
    setQuestion(!compact ? (new URLSearchParams(window.location.search).get('prompt') ?? '').slice(0, 3000) : '');
    setError('');
  }, [user?.id, status.data?.companyId, status.data?.accessRevision, status.isError]);
  useEffect(() => {
    if ((messages.length || busy) && followLatest.current && conversation.current)
      conversation.current.scrollTop = conversation.current.scrollHeight;
  }, [messages, busy]);
  async function send() {
    if (!question.trim() || busy || status.isError || !status.data?.accessRevision) return;
    const identity = activeIdentity.current;
    followLatest.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await request<Message>(`${base}/chat`, {
        method: 'POST',
        body: { companyId: status.data?.companyId, requestId: crypto.randomUUID(), question },
      });
      if (identity !== activeIdentity.current) return;
      queryClient.setQueryData<{ items: Message[]; accessRevision?: string }>(
        historyKey,
        (old) => ({
          accessRevision: status.data?.accessRevision,
          items: [result, ...(old?.items ?? []).filter((m) => m.id !== result.id)].slice(0, 50),
        }),
      );
      setQuestion('');
      await status.refetch();
    } catch (e) {
      if (identity === activeIdentity.current)
        setError(e instanceof Error ? e.message : 'Não foi possível concluir a análise.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      className={`mx-auto flex h-full min-h-0 w-full max-w-5xl flex-col gap-3 overflow-hidden ${compact ? 'p-2' : 'p-3 sm:p-5'}`}
    >
      {!compact && (
        <header className="flex shrink-0 items-center justify-between gap-4 px-1">
          <div className="flex items-center gap-3">
            <Bot className="text-primary" />
            <h1 className="text-lg font-semibold">Assistente IA</h1>
          </div>
          {status.data?.canManage && (
            <Link
              href="/admin/ia"
              aria-label="Configurar assistente"
              className="rounded-lg p-2 text-muted-foreground hover:bg-primary/10 hover:text-primary"
            >
              <Settings2 size={18} />
            </Link>
          )}
        </header>
      )}
      <CompanyPicker
        companies={status.data?.companies}
        value={status.data?.companyId}
        onChange={company.select}
      />
      <div className="glass-card flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card/90 shadow-sm">
        <div
          ref={conversation}
          role="log"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: The scrollable conversation must be keyboard accessible.
          tabIndex={0}
          aria-label="Sua conversa com o assistente"
          aria-live="polite"
          onScroll={(e) => {
            const el = e.currentTarget;
            followLatest.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          }}
          className={`${chatStyles.conversation} min-h-0 flex-1 space-y-8 overflow-y-auto overflow-x-hidden p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40 sm:p-6`}
        >
          {!messages.length && (
            <div className="flex h-full min-h-32 flex-col items-center justify-center text-center">
              <Bot size={32} className="mb-4 text-primary" />
              <h2 className="text-2xl font-medium">Como posso ajudar?</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Pergunte sobre suas ofertas, anúncios e resultados.
              </p>
            </div>
          )}
          {messages
            .filter((m) => !status.isError && m.companyId === status.data?.companyId)
            .map((m) => (
              <article key={m.id} className="space-y-5">
                <div className="ml-auto max-w-[88%] sm:max-w-[75%]">
                  <p className="whitespace-pre-wrap rounded-2xl rounded-tr-sm border border-primary/10 bg-primary/10 px-4 py-3 text-sm leading-6 [overflow-wrap:anywhere]">
                    {m.question}
                  </p>
                  <p className="mt-1.5 text-right text-[11px] text-muted-foreground">Você</p>
                </div>
                <div className="flex min-w-0 gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-primary/15 bg-primary/5">
                    <Bot size={16} className="text-primary" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="mb-2 text-xs font-medium text-primary">Assistente TMX</p>
                    <AiMessageContent text={m.answer} />
                  </div>
                </div>
              </article>
            ))}
          {busy && (
            <output className="block text-sm text-muted-foreground animate-pulse">
              Consultando os dados da empresa…
            </output>
          )}
        </div>
        {(error || status.isError || history.isError) && (
          <p role="alert" className="shrink-0 px-4 py-2 text-sm text-warning">
            {error || 'Não foi possível carregar sua conversa. Tente novamente.'}
          </p>
        )}
        {!status.data?.enabled && !status.isError && (
          <p className="shrink-0 px-4 py-2 text-xs text-muted-foreground">
            A IA ainda não está habilitada nesta empresa.{' '}
            {status.data?.canManage ? (
              <Link href="/admin/ia" className="text-primary underline">
                Abrir configurações
              </Link>
            ) : (
              'Solicite a habilitação ao administrador.'
            )}
          </p>
        )}
        <form
          className="shrink-0 border-t border-border bg-background/40 p-3 sm:p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="sr-only" htmlFor="ai-question">
            Sua mensagem
          </label>
          <textarea
            id="ai-question"
            rows={2}
            maxLength={3000}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            className="max-h-32 w-full resize-none overflow-y-auto rounded-xl bg-transparent p-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary"
            placeholder="Converse com o assistente…"
          />
          <div className="flex items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              Só você vê esta conversa · Somente leitura
            </span>
            <Button
              type="submit"
              aria-label="Enviar mensagem"
              disabled={
                busy ||
                status.isError ||
                !question.trim() ||
                !status.data?.enabled ||
                !status.data?.accessRevision
              }
            >
              <Send size={16} />
              <span>Enviar</span>
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
