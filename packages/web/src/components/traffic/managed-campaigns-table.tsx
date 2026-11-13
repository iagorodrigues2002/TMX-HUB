'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { request } from '@/lib/api-client/request';
import { ApiError } from '@/lib/query-client';
import { useAuth } from '@/lib/auth-context';
import { type BudgetFx, convertBudget, freshBudgetFx } from '@page-cloner/shared/budget-fx';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Banknote, Check, Loader2, Pause, Play, X } from 'lucide-react';
import { useState } from 'react';
import styles from './campaign-controls.module.css';
import { type MetricFormat, MetricsTable } from './traffic-metrics-table';
import type { ReportMetricKey, ReportRow } from './traffic-reports-model';

const endpoint = '/v1/meta-control/traffic/management';
type Item = {
  id: string;
  name: string;
  accountName: string;
  currency: string;
  status: string;
  effectiveStatus: string;
  budget: number | null;
  budgetField: 'daily_budget' | 'lifetime_budget' | null;
  rejected?: { id: string; name: string }[];
  rejectionCheckComplete?: boolean;
  rejectionCheckedAt?: string | null;
  observedAt?: string | null;
};
type Plan = { planId: string; items: Item[] };
type Result = {
  id: string;
  name: string;
  state: string;
  result: Item | null;
  error: string | null;
};
const labels: Record<string, string> = {
  ACTIVE: 'Ativado',
  PAUSED: 'Pausado',
  CAMPAIGN_PAUSED: 'Campanha pausada',
  ADSET_PAUSED: 'Conjunto pausado',
  IN_PROCESS: 'Processamento na Meta',
  DISAPPROVED: 'Rejeitado',
  PENDING_REVIEW: 'Em análise',
  WITH_ISSUES: 'Com problemas',
  ARCHIVED: 'Arquivado',
  DELETED: 'Excluído',
};
const states: Record<string, string> = {
  completed: 'Confirmado pela Meta',
  failed: 'Não confirmado',
  active: 'Verificando na Meta',
  delayed: 'Aguardando nova tentativa',
  waiting: 'Na fila',
  prioritized: 'Na fila',
};
const done = (items: Result[]) =>
  items.length > 0 && items.every((item) => ['completed', 'failed'].includes(item.state));
const money = (amount: number, currency: string) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amount / 100);
const focusBudget = (node: HTMLInputElement | null) => node?.focus();

export function ManagedCampaignsTable({
  rows,
  format,
  columns,
  onOpen,
  accountWarning,
  level,
  currency,
  selectionIds: selected,
  onSelectionChange: setSelected,
}: {
  rows: ReportRow[];
  format: MetricFormat;
  columns: ReportMetricKey[];
  onOpen: (row: ReportRow) => void;
  accountWarning?: (row: ReportRow) => string | null;
  level: 'campaigns' | 'adsets' | 'ads';
  currency: 'BRL' | 'USD';
  selectionIds: string[];
  onSelectionChange: (ids: string[]) => void;
}) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [action, setAction] = useState<'ACTIVE' | 'PAUSED' | 'budget'>('PAUSED');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [inlineAmount, setInlineAmount] = useState('');
  const [notice, setNotice] = useState('');
  const [editingFx, setEditingFx] = useState<BudgetFx | null>(null);
  const [planFx, setPlanFx] = useState<BudgetFx | null>(null);
  const capabilities = useQuery({
    queryKey: ['traffic-management-capabilities', user?.id],
    enabled: !!user,
    queryFn: () => request<{ allowed: boolean; preview: boolean }>(`${endpoint}/capabilities`),
    retry: false,
  });
  const preview = capabilities.data?.preview;
  const allowed = capabilities.data?.allowed;
  const fx = useQuery({
    queryKey: ['traffic-budget-fx', user?.id],
    enabled: !!allowed,
    queryFn: () => request<BudgetFx>(`${endpoint}/fx`),
    refetchInterval: 60_000,
    staleTime: 30_000,
    retry: false,
  });
  const displayedBudget = (item: Item, quote = fx.data) => {
    if (item.budget === null) return null;
    if (item.currency === currency) return item.budget;
    return quote?.rates[item.currency]
      ? convertBudget(item.budget, item.currency, currency, quote)
      : null;
  };
  const metadata = useQuery({
    queryKey: ['traffic-management-items', user?.id, level, rows.map((row) => row.id)],
    enabled: !!allowed && rows.length > 0,
    queryFn: () =>
      request<{ items: Item[] }>(`${endpoint}/items`, {
        method: 'POST',
        body: { level, ids: rows.map((row) => row.id) },
      }),
    staleTime: 60_000,
    refetchInterval: (query) => query.state.data?.items.some(item => item.effectiveStatus === 'IN_PROCESS') ? 30_000 : 60_000,
    retry: false,
  });
  const recent = useQuery({
    queryKey: ['traffic-management-recent', user?.id],
    enabled: !!allowed && !preview,
    queryFn: () => request<{ batches: string[] }>(`${endpoint}/operations`),
    retry: false,
  });
  const activeBatch = batchId ?? recent.data?.batches[0] ?? null;
  const progress = useQuery({
    queryKey: ['traffic-management', user?.id, activeBatch],
    queryFn: () => request<{ results: Result[] }>(`${endpoint}/operations/${activeBatch}`),
    enabled: !!activeBatch,
    refetchInterval: (query) => (query.state.data && done(query.state.data.results) ? false : 2000),
    refetchOnWindowFocus: 'always',
    retry: 1,
  });
  const expired = progress.error instanceof ApiError && progress.error.status === 404;
  const running = !!activeBatch && !expired && (!progress.data || !done(progress.data.results));
  const locked = busy || running;
  const checked = selected.filter((id) => rows.some((row) => row.id === id));
  const itemFor = (id: string) => {
    const item = metadata.data?.items.find((item) => item.id === id);
    const result = progress.data?.results.find(
      (result) => result.id === id && result.state === 'completed',
    )?.result;
    return result &&
      (!item?.observedAt || (result.observedAt && result.observedAt > item.observedAt))
      ? { ...item, ...result }
      : item;
  };
  async function direct(item: Item, change: { status: 'ACTIVE' | 'PAUSED' } | { budget: number }) {
    if (locked) return;
    setError('');
    setNotice('');
    if ('budget' in change && (!editingFx || !freshBudgetFx(editingFx))) {
      setError('A cotação expirou. Cancele a edição e abra novamente para revisar o valor.');
      void fx.refetch();
      return;
    }
    if (preview) {
      setNotice(
        'Prévia: comando validado localmente. O envio real está bloqueado; o valor e o status da Meta foram preservados.',
      );
      setEditing(null);
      return;
    }
    setBusy(true);
    try {
      const current = await request<Plan>(`${endpoint}/prepare`, {
        method: 'POST',
        body: { level, ids: [item.id] },
      });
      const fresh = current.items[0];
      if (
        !fresh ||
        ('budget' in change
          ? fresh.budget !== item.budget ||
            fresh.budgetField !== item.budgetField ||
            fresh.currency !== item.currency
          : fresh.status !== item.status)
      )
        throw Error('O valor ou status mudou na Meta. Atualize a linha antes de tentar novamente.');
      const result = await request<{ batchId: string }>(`${endpoint}/operations`, {
        method: 'POST',
        body: {
          planId: current.planId,
          action: 'budget' in change ? { ...change, currency, quoteId: editingFx!.id } : change,
        },
      });
      setBatchId(result.batchId);
      client.setQueryData(['traffic-management-recent', user?.id], { batches: [result.batchId] });
      setEditing(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar a alteração.');
      void metadata.refetch();
    } finally {
      setBusy(false);
    }
  }
  async function prepare(next: typeof action, ids = checked) {
    if (!ids.length) return;
    setAction(next);
    setBusy(true);
    setError('');
    try {
      if (preview && next !== 'budget') {
        setPlan({
          planId: '',
          items: rows
            .filter((row) => ids.includes(row.id))
            .map((row) => ({
              id: row.id,
              name: row.name,
              accountName: row.subtitle,
              currency: '',
              status: row.status ?? '',
              effectiveStatus: '',
              budget: null,
              budgetField: null,
            })),
        });
        setAmount('');
      } else {
        const current = await request<Plan>(`${endpoint}/prepare`, {
          method: 'POST',
          body: { level, ids },
        });
        setPlan(current);
        setPlanFx(fx.data ?? null);
        const value = current.items[0] ? displayedBudget(current.items[0]) : null;
        setAmount(value === null ? '' : String(value / 100));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível consultar a Meta.');
    } finally {
      setBusy(false);
    }
  }
  async function confirm() {
    if (!plan || preview || busy) return;
    setBusy(true);
    setError('');
    try {
      const result = await request<{ batchId: string }>(`${endpoint}/operations`, {
        method: 'POST',
        body: {
          planId: plan.planId,
          action:
            action === 'budget'
              ? {
                  budget: Math.round(Number(amount.replace(',', '.')) * 100),
                  currency,
                  quoteId: planFx?.id,
                }
              : { status: action },
        },
      });
      setBatchId(result.batchId);
      client.setQueryData(['traffic-management-recent', user?.id], { batches: [result.batchId] });
      setPlan(null);
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível enviar a operação.');
    } finally {
      setBusy(false);
    }
  }
  const budgetItem = plan?.items[0];
  const supportedCurrency =
    !!budgetItem && ['USD', 'BRL', 'EUR', 'GBP'].includes(budgetItem.currency);
  const validAmount =
    /^\d+([.,]\d{1,2})?$/.test(amount) &&
    Number(amount.replace(',', '.')) > 0 &&
    Number.isSafeInteger(Math.round(Number(amount.replace(',', '.')) * 100));
  const validBatchBudget =
    !!plan?.items.length &&
    plan.items.every(
      (item) =>
        item.budgetField &&
        !!planFx?.rates[item.currency] &&
        item.budgetField === budgetItem?.budgetField,
    );
  const validInlineAmount =
    /^\d+([.,]\d{1,2})?$/.test(inlineAmount) &&
    Number.isSafeInteger(Math.round(Number(inlineAmount.replace(',', '.')) * 100)) &&
    Number(inlineAmount.replace(',', '.')) > 0;
  const displayedRows = rows.map((row) => {
    const result = batchId
      ? progress.data?.results.find((item) => item.id === row.id && item.state === 'completed')
          ?.result
      : null;
    return result
      ? {
          ...row,
          status:
            result.effectiveStatus === 'ACTIVE'
              ? 'Ativa'
              : result.effectiveStatus === 'PAUSED'
                ? 'Pausada'
                : (labels[result.effectiveStatus] ?? result.effectiveStatus),
        }
      : row;
  });
  return (
    <div className="space-y-3">
      {allowed && (
        <p className="text-xs text-muted-foreground">
          {fx.data
            ? `Orçamentos em ${currency} · cotação ${new Date(fx.data.quotedAt).toLocaleString('pt-BR')} · atualização a cada minuto`
            : 'Cotação do orçamento indisponível.'}
          {fx.data &&
            (!freshBudgetFx(fx.data) || fx.isError) &&
            ' · Última cotação salva; edição bloqueada até atualizar.'}
        </p>
      )}
      {allowed && (
        <div className="glass-card flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 p-3">
          <span className="mr-auto text-sm">
            {checked.length ? `${checked.length} selecionado(s)` : 'Selecione itens para gerenciar'}
          </span>
          {preview && (
            <span className="text-xs text-muted-foreground">Prévia · sem envio à Meta</span>
          )}
          <Button
            size="sm"
            variant="outline"
            disabled={locked || !checked.length}
            onClick={() => prepare('ACTIVE')}
          >
            <Play className="mr-2 size-4" />
            Ativar
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={locked || !checked.length}
            onClick={() => prepare('PAUSED')}
          >
            <Pause className="mr-2 size-4" />
            Pausar
          </Button>
          {checked.length > 0 && level !== 'ads' && (
            <Button size="sm" variant="outline" disabled={locked} onClick={() => prepare('budget')}>
              <Banknote className="mr-2 size-4" /> Orçamento em massa
            </Button>
          )}
          {checked.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              aria-label="Limpar seleção"
              disabled={locked}
              onClick={() => setSelected([])}
            >
              <X className="size-4" />
            </Button>
          )}
          {busy && <Loader2 className="size-4 animate-spin" aria-label="Consultando" />}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {notice && <output className="block text-sm text-muted-foreground">{notice}</output>}
      {(busy || running) && (
        <div role="status" className="glass-card flex items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">
          <Loader2 className="size-4 shrink-0 animate-spin" />
          <span>{busy ? 'Enviando alteração…' : 'Alteração na fila da Meta. Aguarde a confirmação para fazer outra alteração; há um intervalo mínimo de 65 segundos entre comandos.'}</span>
        </div>
      )}
      {metadata.isError && (
        <p role="alert" className="text-sm text-destructive">
          Não foi possível atualizar status e orçamentos.{' '}
          <button type="button" className="underline" onClick={() => metadata.refetch()}>
            Tentar novamente
          </button>
        </p>
      )}
      {progress.isError && (
        <p role="alert" className="text-sm text-destructive">
          {expired ? 'O histórico desta operação expirou. Confira o status atualizado na linha antes de alterar novamente.' : 'Não foi possível consultar a fila. A operação pode continuar no servidor; não envie novamente.'}
          {!expired && <button type="button" className="ml-2 underline" onClick={() => progress.refetch()}>Consultar novamente</button>}
        </p>
      )}
      {progress.data && (
        <details open={running} className="rounded-xl border border-border p-3">
          <summary className="cursor-pointer text-sm">
            {running ? 'Alterações em andamento' : 'Resultado das alterações'} ·{' '}
            {progress.data.results.filter((item) => item.state === 'completed').length}/
            {progress.data.results.length} confirmadas
          </summary>
          <p className="my-2 text-xs text-muted-foreground">
            Uma operação por vez, com intervalo mínimo de 65 segundos.
          </p>
          <ul aria-live="polite" className="space-y-2">
            {progress.data.results.map((item) => (
              <li key={item.id} className="text-xs">
                <strong>{item.name}</strong> · {states[item.state] ?? item.state}
                {item.result && item.result.budget !== null && ` · Orçamento confirmado: ${money(item.result.budget, item.result.currency)}`}
                {item.result?.effectiveStatus === 'IN_PROCESS' && ' · A Meta ainda processa a veiculação; o comando já foi confirmado.'}
                {item.error && item.state === 'failed' && (
                  <p className="text-destructive">
                    {item.error} Confira o estado atual antes de reenviar.
                  </p>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      <MetricsTable
        rows={displayedRows}
        format={format}
        columns={columns}
        onOpen={onOpen}
        caption="Campanhas reais da Meta"
        hideInlineStatus
        beforeName={
          allowed
            ? (row) => {
                const item = itemFor(row.id);
                const pending = progress.data?.results.find(
                  (result) =>
                    result.id === row.id && !['completed', 'failed'].includes(result.state),
                );
                return (
                  <button
                    type="button"
                    role="switch"
                    aria-checked={item?.status === 'ACTIVE'}
                    aria-busy={busy || running}
                    aria-label={`Ativar ou pausar ${row.name}`}
                    title={
                      busy || running
                        ? 'Aguarde a confirmação da alteração em andamento'
                        : item
                        ? `Status configurado: ${labels[item.status] ?? item.status}`
                        : 'Aguardando status da Meta'
                    }
                    disabled={locked || !item || !['ACTIVE', 'PAUSED'].includes(item.status)}
                    onClick={() =>
                      item &&
                      direct(item, { status: item.status === 'ACTIVE' ? 'PAUSED' : 'ACTIVE' })
                    }
                    className={`relative mr-3 inline-flex h-6 w-10 shrink-0 items-center rounded-full border align-middle transition-colors motion-reduce:transition-none disabled:cursor-wait disabled:opacity-70 ${item?.status === 'ACTIVE' ? styles.activeSwitch : 'border-border bg-muted'}`}
                  >
                    <span
                      className={`${styles.switchThumb} inline-flex size-4 items-center justify-center rounded-full transition-transform motion-reduce:transition-none ${item?.status === 'ACTIVE' ? 'translate-x-5' : 'translate-x-1'}`}
                    >
                      {(pending || busy || running) && <Loader2 className="size-3 animate-spin" />}
                    </span>
                  </button>
                );
              }
            : undefined
        }
        leadingColumns={[
          ...(level !== 'ads'
            ? [
                {
                  key: 'budget',
                  label: 'Orçamento',
                  render: (row: ReportRow) => {
                    const item = itemFor(row.id);
                    if (!item) return <span title="Aguardando leitura da Meta">—</span>;
                    if (!item.budgetField || item.budget === null)
                      return (
                        <span className="text-xs text-muted-foreground">
                          No {level === 'adsets' ? 'nível da campanha' : 'conjunto'}
                        </span>
                      );
                    const editable = ['USD', 'BRL', 'EUR', 'GBP'].includes(item.currency);
                    if (!editable)
                      return (
                        <span className="text-xs">Moeda {item.currency} · edição indisponível</span>
                      );
                    const shown = displayedBudget(item);
                    return editing === row.id ? (
                      <form
                        className="grid w-48 grid-cols-[auto_minmax(0,1fr)_auto_auto] items-center gap-1"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (validInlineAmount)
                            void direct(item, {
                              budget: Math.round(Number(inlineAmount.replace(',', '.')) * 100),
                            });
                        }}
                      >
                        <span className="text-xs">{currency}</span>
                        <input
                          ref={focusBudget}
                          aria-label={`Novo orçamento de ${row.name}`}
                          inputMode="decimal"
                          value={inlineAmount}
                          disabled={locked}
                          onChange={(event) => setInlineAmount(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Escape') setEditing(null);
                          }}
                          className="min-w-0 w-full rounded-md border border-input bg-background p-2 text-sm"
                        />
                        <button
                          type="submit"
                          disabled={!validInlineAmount || locked}
                          aria-label="Salvar orçamento"
                          className="p-2 disabled:opacity-40"
                        >
                          <Check className="size-4" />
                        </button>
                        {validInlineAmount && editingFx && (
                          <span className="col-span-4 row-start-2 whitespace-normal break-words text-xs text-muted-foreground">
                            Meta:{' '}
                            {money(
                              convertBudget(
                                Math.round(Number(inlineAmount.replace(',', '.')) * 100),
                                currency,
                                item.currency,
                                editingFx,
                              ),
                              item.currency,
                            )}
                          </span>
                        )}
                        <button
                          type="button"
                          disabled={locked}
                          onClick={() => setEditing(null)}
                          aria-label="Cancelar orçamento"
                          className="col-start-4 row-start-1 p-2"
                        >
                          <X className="size-4" />
                        </button>
                      </form>
                    ) : (
                      <button
                        type="button"
                        disabled={
                          !allowed ||
                          locked ||
                          !fx.data ||
                          !freshBudgetFx(fx.data) ||
                          shown === null
                        }
                        aria-label={`Editar orçamento de ${row.name}`}
                        onClick={() => {
                          setEditing(row.id);
                          setEditingFx(fx.data ?? null);
                          setInlineAmount(shown === null ? '' : String(shown / 100));
                        }}
                        className="w-48 rounded-lg border border-transparent px-2 py-1 text-left hover:border-border hover:bg-muted/40"
                      >
                        <strong className="block tabular-nums">
                          {shown === null ? '—' : money(shown, currency)}
                        </strong>
                        <span className="text-xs text-muted-foreground">
                          {currency} · {item.budgetField === 'daily_budget' ? 'por dia' : 'total'}
                        </span>
                      </button>
                    );
                  },
                },
              ]
            : []),
          {
            key: 'status',
            label: 'Status',
            render: (row) => {
              const item = itemFor(row.id);
              const status =
                item?.effectiveStatus ??
                (row.status === 'Ativa'
                  ? 'ACTIVE'
                  : row.status === 'Pausada'
                    ? 'PAUSED'
                    : row.status);
              const rejected = item?.rejected ?? [];
              const description = rejected.map((ad) => `${ad.name} · ID ${ad.id}`).join('\n');
              return (
                <div className="min-h-[52px] min-w-[208px] max-w-60 space-y-1">
                  <div className="flex items-center gap-1.5">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${status === 'ACTIVE' ? styles.activeStatus : status && ['PAUSED', 'CAMPAIGN_PAUSED', 'ADSET_PAUSED'].includes(status) ? styles.pausedStatus : 'bg-muted text-muted-foreground'}`}
                  >
                    {status === 'ACTIVE'
                      ? 'Ativo'
                      : status === 'PAUSED'
                        ? 'Pausada'
                        : status
                          ? (labels[status] ?? status)
                          : 'Aguardando'}
                  </span>
                  {accountWarning?.(row) && <span className="inline-flex items-center gap-1 rounded-md bg-danger/10 px-2 py-1 text-[11px] font-medium text-danger" title={accountWarning(row) ?? undefined}><AlertTriangle className="size-3 shrink-0" />Conta desativada</span>}
                  {item && !item.rejectionCheckComplete && <span role="img" aria-label="Verificação de rejeições ainda incompleta" title="O monitor ainda não confirmou todos os anúncios desta linha." className="inline-flex text-warning"><AlertTriangle className="size-3.5" /></span>}
                  </div>
                  {(rejected.length > 0 || status === 'DISAPPROVED') && (
                    <details className="text-xs text-danger">
                      <summary
                        title={description || `Rejeitado: ${row.name}`}
                        className="w-fit cursor-pointer rounded-md bg-danger/10 px-2 py-0.5 text-[11px]"
                      >
                        <AlertTriangle className="mr-1 inline size-3" />
                        {rejected.length || 1} rejeitado(s)
                      </summary>
                      <ul className="max-w-72 whitespace-normal">
                        {rejected.length ? (
                          rejected.map((ad) => (
                            <li key={ad.id} className="my-2">
                              {ad.name}
                              <small className="block">ID {ad.id}</small>
                            </li>
                          ))
                        ) : (
                          <li>{row.name}</li>
                        )}
                      </ul>
                    </details>
                  )}
                </div>
              );
            },
          },
        ]}
        selection={
          allowed
            ? {
                ids: checked,
                disabled: locked,
                toggle: (ids, value) =>
                  setSelected(
                    value
                      ? [...new Set([...checked, ...ids])]
                      : checked.filter((id) => !ids.includes(id)),
                  ),
              }
            : undefined
        }
      />
      <Dialog
        open={!!plan}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setPlan(null);
            setError('');
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === 'budget'
                ? 'Alterar orçamento'
                : action === 'ACTIVE'
                  ? 'Ativar seleção'
                  : 'Pausar seleção'}
            </DialogTitle>
            <DialogDescription>
              {preview
                ? 'Prévia com dados importados. Nenhuma alteração será enviada à Meta.'
                : 'Confira os itens antes de confirmar. O resultado será verificado diretamente na Meta.'}
            </DialogDescription>
          </DialogHeader>
          <ul className="max-h-60 space-y-3 overflow-auto">
            {plan?.items.map((item) => (
              <li key={item.id} className="rounded-lg border border-border p-3 text-sm">
                <strong className="block">{item.name}</strong>
                <span className="text-xs text-muted-foreground">
                  {item.accountName} · {item.id}
                </span>
                {action === 'budget' &&
                  item.budget !== null &&
                  ['USD', 'BRL', 'EUR', 'GBP'].includes(item.currency) && (
                    <p className="mt-1 text-xs">
                      Atual na Meta: {money(item.budget, item.currency)} ·{' '}
                      {item.budgetField === 'daily_budget' ? 'diário' : 'total'}
                      {validAmount && planFx?.rates[item.currency]
                        ? ` → ${money(convertBudget(Math.round(Number(amount.replace(',', '.')) * 100), currency, item.currency, planFx), item.currency)}`
                        : ''}
                    </p>
                  )}
                {!preview && (
                  <p className="mt-1">
                    {labels[item.status] ?? item.status}
                    {action !== 'budget' && ` → ${labels[action]}`}
                  </p>
                )}
              </li>
            ))}
          </ul>
          {action === 'budget' &&
            (budgetItem?.budgetField && supportedCurrency ? (
              <label className="space-y-2 text-sm">
                <span className="block">
                  Orçamento {budgetItem.budgetField === 'daily_budget' ? 'diário' : 'total'} ·{' '}
                  {currency}
                </span>
                <span className="block text-muted-foreground">
                  Novo valor para cada item selecionado
                </span>
                <input
                  aria-label="Novo orçamento"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full rounded-lg border border-input bg-background p-3"
                />
                <span className="block text-xs text-muted-foreground">
                  Valor em {currency}. Cada conta receberá o equivalente na sua moeda original.
                </span>
              </label>
            ) : (
              <p className="text-sm text-muted-foreground">
                {!supportedCurrency
                  ? 'Edição de orçamento disponível em USD, BRL, EUR e GBP.'
                  : 'Este item não tem orçamento próprio. Edite a campanha com orçamento compartilhado ou o conjunto com orçamento individual.'}
              </p>
            ))}
          {action === 'budget' && !validBatchBudget && (
            <p role="alert" className="text-sm text-destructive">
              Selecione itens com orçamento próprio, cotação disponível e do mesmo tipo.
            </p>
          )}
          {action === 'ACTIVE' && (
            <p className="text-xs text-muted-foreground">
              Ativar um anúncio ou conjunto não ativa a campanha acima dele.
            </p>
          )}
          {plan && plan.items.length > 1 && (
            <p className="text-xs text-muted-foreground">
              Envio gradual: intervalo de 65 segundos entre itens. Este lote leva pelo menos{' '}
              {Math.ceil(((plan.items.length - 1) * 65) / 60)} min, além de eventuais novas
              tentativas.
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setPlan(null)}>
              Cancelar
            </Button>
            <Button
              disabled={
                busy ||
                preview ||
                (action === 'budget' &&
                  (!budgetItem?.budgetField ||
                    !supportedCurrency ||
                    !validAmount ||
                    !planFx ||
                    !freshBudgetFx(planFx) ||
                    !validBatchBudget))
              }
              onClick={confirm}
            >
              {busy ? 'Enviando…' : 'Confirmar alteração'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
