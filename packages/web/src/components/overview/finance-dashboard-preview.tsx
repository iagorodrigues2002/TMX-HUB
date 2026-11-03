'use client';

import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { companyApi } from '@/lib/api-client/endpoints-companies';
import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import { financeValidationError } from '@/lib/finance-validation-error';
import { usePrivacy } from '@/lib/privacy-context';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, KeyRound, Landmark, RefreshCw, Unplug } from 'lucide-react';
import { useState } from 'react';
import { FinancePayees } from './finance-payees';
import { FinanceReserve } from './finance-reserve';

const tabs = [
  'Resumo',
  'Movimentações',
  'Saques',
  'Despesas',
  'Reserva',
  'Colaboradores',
  'Integrações',
] as const;
type Provider = 'wise' | 'lootrush';
type Balance = {
  id: string;
  currency: string;
  amount: string;
  label: string;
  at: string;
  stale: boolean;
};
type Connection = {
  id: string;
  provider: Provider;
  label: string;
  status: string;
  error_code: string | null;
  history_start: string;
  history_cursor: string | null;
  history_supported: boolean | null;
  last_sync_at: string | null;
  balances: Balance[];
};
type Entry = {
  external_id: string;
  provider: Provider;
  occurred_at: string;
  kind: string;
  description: string;
  status: string;
  sent: string | null;
  sent_currency: string | null;
  received: string | null;
  received_currency: string | null;
};
type FinanceData = {
  connections: Connection[];
  entries: Entry[];
  hasMore: boolean;
  isolated: boolean;
};
const names = { wise: 'Wise', lootrush: 'LootRush' };
const panel = 'rounded-2xl border border-border bg-card/95 p-5 sm:p-6';
const control =
  'min-h-11 min-w-0 rounded-lg border border-input bg-bg-elevated px-3 py-2 text-sm text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
const time = (s: string | null) =>
  s
    ? new Date(s).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
    : 'Ainda não consultado';
const states: Record<string, string> = {
  queued: 'Na fila',
  syncing: 'Importando',
  ready: 'Atualizado',
  balance_only: 'Somente saldo',
  error: 'Atenção necessária',
  disconnected: 'Desconectado',
};

function ConnectionForm({ company, refresh }: { company: string; refresh: () => void }) {
  const [provider, setProvider] = useState<Provider>('wise');
  const [key, setKey] = useState('');
  const [profiles, setProfiles] = useState<{ id: string; name: string }[]>([]);
  const [profile, setProfile] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  async function submit() {
    setBusy(true);
    setMessage('');
    try {
      const base = `/v1/companies/${company}/finance`;
      if (!profiles.length) {
        const result = await request<{ profiles: { id: string; name: string }[] }>(
          `${base}/profiles`,
          { method: 'POST', body: { provider, apiKey: key } },
        );
        setProfiles(result.profiles);
        setProfile(result.profiles.length === 1 ? result.profiles[0]!.id : '');
        setMessage(
          result.profiles.length
            ? 'Chave validada. Confirme a conta e salve.'
            : 'Nenhum perfil disponível.',
        );
      } else {
        await request(`${base}/connections`, {
          method: 'POST',
          body: { provider, apiKey: key, profileId: profile, label: names[provider] },
        });
        setKey('');
        setProfiles([]);
        setProfile('');
        refresh();
        setMessage('Conexão salva. Importação de até 90 dias agendada.');
      }
    } catch (error) {
      setMessage(financeValidationError(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className={`${panel} space-y-4`}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <h3 className="font-semibold">Conectar conta ou substituir chave</h3>
      <label className="grid gap-1 text-sm">
        Provedor
        <select
          className={control}
          value={provider}
          disabled={busy}
          onChange={(e) => {
            setProvider(e.target.value as Provider);
            setProfiles([]);
            setKey('');
            setProfile('');
          }}
        >
          <option value="wise">Wise</option>
          <option value="lootrush">LootRush</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Chave API
        <input
          className={control}
          type="password"
          autoComplete="new-password"
          required
          minLength={16}
          maxLength={4096}
          value={key}
          disabled={busy}
          onChange={(e) => {
            setKey(e.target.value);
            setProfiles([]);
            setProfile('');
          }}
        />
      </label>
      {!!profiles.length && (
        <label className="grid gap-1 text-sm">
          Conta desta empresa
          <select
            className={control}
            value={profile}
            onChange={(e) => setProfile(e.target.value)}
            required
            disabled={busy}
          >
            <option value="">Selecione</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.id}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="text-xs text-muted-foreground">
        Chave criptografada no servidor. Não realiza pagamentos, saques nem transferências.
        Substituir a chave preserva o histórico da mesma conta.
      </p>
      <Button
        type="submit"
        className="h-11"
        disabled={busy || (!!profiles.length && !profile)}
        loading={busy}
        loadingLabel="Validando…"
      >
        <KeyRound aria-hidden />
        {profiles.length ? 'Salvar e importar' : 'Validar chave'}
      </Button>
      <output className="block text-sm" aria-live="polite">
        {message}
      </output>
    </form>
  );
}

function FinanceAccountView({ company }: { company: string }) {
  const { user } = useAuth();
  const { isPrivate } = usePrivacy();
  const [tab, setTab] = useState<(typeof tabs)[number]>('Resumo');
  const [provider, setProvider] = useState('');
  const [page, setPage] = useState(1);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const data = useQuery({
    queryKey: ['company-finance', user?.id, company, provider, page, tab],
    queryFn: () =>
      request<FinanceData>(
        `/v1/companies/${company}/finance?page=${page}&view=${tab === 'Saques' ? 'withdrawals' : tab === 'Despesas' ? 'outgoing' : 'all'}${provider ? `&provider=${provider}` : ''}`,
      ),
    refetchInterval: 15000,
    gcTime: 0,
  });
  const money = (value: string | null, currency: string | null) =>
    value == null
      ? '—'
      : isPrivate
        ? '••••'
        : `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 8 })} ${currency ?? ''}`;
  const connections = (data.data?.connections ?? []).filter(
    (c) => !provider || c.provider === provider,
  );
  async function action(id: string, remove: boolean) {
    if (
      remove &&
      !window.confirm(
        'Desconectar? O histórico será mantido. Revogue também a chave no provedor se necessário.',
      )
    )
      return;
    setBusy(true);
    setMessage('');
    try {
      await request(`/v1/companies/${company}/finance/connections/${id}${remove ? '' : '/sync'}`, {
        method: remove ? 'DELETE' : 'POST',
      });
      await data.refetch();
      setMessage(remove ? 'Chave removida. Histórico preservado.' : 'Consulta agendada.');
    } catch {
      setMessage(
        'Não foi possível concluir. Confira sua permissão ou aguarde a sincronização atual.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Tabs
      value={tab}
      onValueChange={(value) => {
        setTab(value as (typeof tabs)[number]);
        setPage(1);
      }}
      className="min-w-0 space-y-5"
    >
      <TabsList aria-label="Seções do financeiro" className="sm:h-auto sm:justify-start">
        {tabs.map((t) => (
          <TabsTrigger key={t} value={t} className="sm:h-11">
            {t}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent key={tab} value={tab} className="space-y-5">
        {tab === 'Colaboradores' ? (
          <FinancePayees company={company} />
        ) : tab === 'Reserva' ? (
          <FinanceReserve company={company} />
        ) : (
          <>
            <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4">
              <label className="grid min-w-0 w-full gap-2 text-sm sm:max-w-xs sm:flex-1">
                Provedor
                <select
                  className={control}
                  value={provider}
                  onChange={(e) => {
                    setProvider(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">Todos os provedores</option>
                  <option value="wise">Wise</option>
                  <option value="lootrush">LootRush</option>
                </select>
              </label>
              <Button
                type="button"
                variant="outline"
                className="h-11 w-full sm:w-auto"
                onClick={() => {
                  void data.refetch();
                }}
                disabled={data.isFetching}
                loading={data.isFetching}
                loadingLabel="Atualizando…"
              >
                <RefreshCw aria-hidden />
                Atualizar painel
              </Button>
            </div>
            {data.isError ? (
              <p role="alert" className={panel}>
                Não foi possível consultar o Financeiro. Nenhum saldo foi presumido.
              </p>
            ) : data.isPending ? (
              <p className={panel}>Carregando dados salvos…</p>
            ) : (
              <>
                {!connections.length && (
                  <p className={panel}>Nenhuma conta conectada. Cadastre a chave em Integrações.</p>
                )}
                {(tab === 'Resumo' || tab === 'Integrações') && (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {connections.map((c) => (
                      <section key={c.id} className={`${panel} space-y-3`}>
                        <h2 className="flex items-center gap-2 font-semibold">
                          <Landmark size={18} />
                          {c.label} · {names[c.provider]}
                        </h2>
                        <p className="text-sm">
                          {states[c.status] ?? c.status} · Última consulta: {time(c.last_sync_at)}
                        </p>
                        {c.error_code && (
                          <p role="alert" className="text-amber-500">
                            Consulta não concluída ({c.error_code}). Os dados da última leitura
                            foram preservados.
                          </p>
                        )}
                        {c.balances.map((b) => (
                          <div key={b.id}>
                            <p className="text-xs text-muted-foreground">{b.label}</p>
                            <p className="text-2xl font-semibold tabular-nums">
                              {money(b.amount, b.currency)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {time(b.at)}
                              {b.stale ? ' · leitura desatualizada' : ''}
                            </p>
                          </div>
                        ))}
                        <p className="text-xs text-muted-foreground">
                          {c.history_supported === false
                            ? 'Extrato não autorizado pela Wise. Somente saldo; histórico não é zero.'
                            : `Histórico desde ${time(c.history_start)} · importado até ${time(c.history_cursor)}`}
                        </p>
                        <div className="flex flex-wrap gap-3">
                          <Button
                            type="button"
                            variant="outline"
                            className="h-11"
                            disabled={busy || c.status === 'disconnected' || c.status === 'syncing'}
                            onClick={() => void action(c.id, false)}
                          >
                            <RefreshCw aria-hidden />
                            Sincronizar
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            className="h-11"
                            disabled={busy || c.status === 'disconnected'}
                            onClick={() => void action(c.id, true)}
                          >
                            <Unplug aria-hidden />
                            Desconectar
                          </Button>
                        </div>
                      </section>
                    ))}
                  </div>
                )}
                {(['Movimentações', 'Saques', 'Despesas'] as string[]).includes(tab) && (
                  <section className={`${panel} space-y-4`}>
                    <p className="text-sm text-muted-foreground">
                      Movimentações bancárias não são vendas nem lucro. Transferências e conversões
                      não entram no faturamento. Valores na moeda original.
                      {tab === 'Despesas' &&
                        ' Aqui aparecem saídas a conciliar; nem toda saída é despesa.'}
                      {tab === 'Saques' &&
                        ' Somente operações identificadas como saque pelo provedor.'}
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead>
                          <tr>
                            {[
                              'Data (São Paulo)',
                              'Conta / descrição',
                              'Tipo / estado',
                              'Enviado',
                              'Recebido',
                            ].map((h) => (
                              <th key={h} className="p-3">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {data.data?.entries.map((r) => (
                            <tr
                              key={`${r.provider}:${r.external_id}`}
                              className="border-t border-border"
                            >
                              <td className="whitespace-nowrap p-3">{time(r.occurred_at)}</td>
                              <td className="p-3">
                                {names[r.provider]}
                                <p className="max-w-md break-words text-muted-foreground">
                                  {r.description}
                                </p>
                              </td>
                              <td className="p-3">
                                {r.kind} · {r.status}
                              </td>
                              <td className="p-3 tabular-nums">{money(r.sent, r.sent_currency)}</td>
                              <td className="p-3 tabular-nums">
                                {money(r.received, r.received_currency)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {!data.data?.entries.length && (
                      <p>Nenhuma movimentação importada neste filtro.</p>
                    )}
                    <nav
                      aria-label="Páginas das movimentações"
                      className="flex flex-wrap items-center justify-between gap-3"
                    >
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11"
                        disabled={page === 1}
                        onClick={() => setPage(page - 1)}
                      >
                        <ChevronLeft aria-hidden />
                        Anterior
                      </Button>
                      <span
                        className="text-sm tabular-nums text-muted-foreground"
                        aria-live="polite"
                      >
                        Página {page}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        className="h-11"
                        disabled={!data.data?.hasMore}
                        onClick={() => setPage(page + 1)}
                      >
                        Próxima
                        <ChevronRight aria-hidden />
                      </Button>
                    </nav>
                  </section>
                )}
              </>
            )}
            {tab === 'Integrações' && (
              <>
                {data.data?.isolated && (
                  <p role="note" className="rounded-lg border border-amber-500/30 p-3 text-sm">
                    Homologação isolada: esta prévia bloqueia consultas externas. Não cadastre
                    chaves reais aqui. O fluxo é validado com dados sintéticos; a conexão real será
                    conferida no ambiente autorizado.
                  </p>
                )}
                <p className="text-sm text-muted-foreground">
                  Uma conta de cada provedor por empresa. Primeira importação: 90 dias. Depois:
                  consultas a cada 15 minutos, com sobreposição de dois dias. Restrições da Wise
                  podem impedir extratos. LootRush exige histórico e escopo MCP.
                </p>
                <ConnectionForm
                  company={company}
                  refresh={() => {
                    void data.refetch();
                  }}
                />
              </>
            )}
            <output aria-live="polite" className="block text-sm">
              {message}
            </output>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}

export function FinanceDashboardPreview() {
  const { user } = useAuth();
  const [selected, setSelected] = useState('');
  const companies = useQuery({
    queryKey: ['finance-companies', user?.id],
    queryFn: companyApi.list,
    enabled: !!user,
  });
  const managed =
    companies.data?.companies.filter((c) => c.role === 'owner' || c.role === 'admin') ?? [];
  const company = managed.find((c) => c.id === selected)?.id ?? managed[0]?.id ?? '';
  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-muted-foreground">Empresa / Financeiro</p>
        <h1 className="mt-1 text-3xl font-semibold">Seu caixa, sem pontos cegos.</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Saldos e histórico por empresa. Somente leitura, sem executar pagamentos.
        </p>
      </header>
      {companies.isError ? (
        <p role="alert">Não foi possível carregar suas empresas.</p>
      ) : companies.isPending ? (
        <p>Carregando empresas…</p>
      ) : !company ? (
        <p>
          Somente proprietários e administradores da empresa podem acessar suas contas financeiras.
        </p>
      ) : (
        <>
          <label className="grid max-w-lg gap-2 text-sm">
            Empresa
            <select
              className={control}
              value={company}
              onChange={(e) => setSelected(e.target.value)}
            >
              {managed.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <FinanceAccountView key={company} company={company} />
        </>
      )}
    </div>
  );
}
