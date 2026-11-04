'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { DataState } from '@/components/ui/data-state';
import { DateRangeFilter } from '@/components/ui/date-range-filter';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowDown, ArrowUp, Loader2 } from 'lucide-react';
import { useEffect, useReducer, useRef, useState } from 'react';
import {
  type DemoForm,
  type DemoOffer,
  demoOffers,
  initialJob,
  jobStep,
  offerPage,
  validateDemoFile,
  validateDemoForm,
} from './reference-operations-model';
import styles from './reference.module.css';

export function TableSpecimen({ theme, motion }: { theme: 'dark' | 'light'; motion: boolean }) {
  const [rows, setRows] = useState(demoOffers);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('Todas');
  const [sort, setSort] = useState<'name' | 'revenue'>('name');
  const [descending, setDescending] = useState(false);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const [undo, setUndo] = useState<DemoOffer[] | null>(null);
  const [message, setMessage] = useState('Seleção limitada à página atual. Dados fictícios.');
  const result = offerPage(rows, query, status, sort, descending, page);
  const all = result.rows.length > 0 && result.rows.every((row) => selected.includes(row.id));
  const sortBy = (column: 'name' | 'revenue') => {
    setSort(column);
    setDescending(sort === column ? !descending : false);
    setPage(1);
    setSelected([]);
  };
  return (
    <Card className={styles.surface}>
      <CardHeader>
        <CardTitle>Tabela operacional · ofertas</CardTitle>
        <CardDescription>
          Busca, ordenação, paginação, seleção e ação reversível em lote. Rolagem horizontal fica
          restrita à tabela.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className={styles.operationsToolbar}>
          <FormField id="reference-table-search" label="Buscar oferta ou ID">
            <Input
              className={styles.input}
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
                setSelected([]);
              }}
              placeholder="Ex.: Aurora ou DEMO-003"
            />
          </FormField>
          <div>
            <p id="reference-table-status" className={styles.fieldLabel}>
              Status
            </p>
            <Select
              value={status}
              onValueChange={(value) => {
                setStatus(value);
                setPage(1);
                setSelected([]);
              }}
            >
              <SelectTrigger className={styles.select} aria-labelledby="reference-table-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent
                className={`tmx-glass-reference ${styles.overlay}`}
                data-theme={theme}
                data-motion={motion ? 'on' : 'off'}
              >
                {['Todas', 'Ativa', 'Pausada'].map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            className={styles.secondary}
            variant="outline"
            disabled={!selected.length}
            onClick={() => {
              setUndo(rows);
              setRows(
                rows.map((row) =>
                  selected.includes(row.id) ? { ...row, status: 'Pausada' } : row,
                ),
              );
              setMessage(`${selected.length} oferta(s) pausada(s) somente nesta demonstração.`);
              setSelected([]);
            }}
          >
            Pausar selecionadas ({selected.length})
          </Button>
          {undo && (
            <Button
              className={styles.secondary}
              variant="ghost"
              onClick={() => {
                setRows(undo);
                setUndo(null);
                setMessage('Alteração local desfeita.');
              }}
            >
              Desfazer
            </Button>
          )}
        </div>
        <section
          className={`${styles.auditTable} ${styles.operationsTable}`}
          aria-label="Tabela de ofertas, role horizontalmente se necessário"
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Scrollable region needs keyboard scrolling access.
          tabIndex={0}
        >
          <table>
            <caption className={styles.srOnly}>Ofertas demonstrativas · valores em BRL</caption>
            <thead>
              <tr>
                <th scope="col">
                  <Checkbox
                    aria-label="Selecionar todas as ofertas desta página"
                    checked={all}
                    ref={(element) => {
                      if (element) element.indeterminate = selected.length > 0 && !all;
                    }}
                    onChange={() => setSelected(all ? [] : result.rows.map((row) => row.id))}
                  />
                </th>
                <th
                  scope="col"
                  aria-sort={sort === 'name' ? (descending ? 'descending' : 'ascending') : 'none'}
                >
                  <button type="button" onClick={() => sortBy('name')}>
                    Oferta{' '}
                    {sort === 'name' &&
                      (descending ? <ArrowDown aria-hidden /> : <ArrowUp aria-hidden />)}
                  </button>
                </th>
                <th scope="col">Status</th>
                <th scope="col">Vendas</th>
                <th
                  scope="col"
                  aria-sort={
                    sort === 'revenue' ? (descending ? 'descending' : 'ascending') : 'none'
                  }
                >
                  <button type="button" onClick={() => sortBy('revenue')}>
                    Receita{' '}
                    {sort === 'revenue' &&
                      (descending ? <ArrowDown aria-hidden /> : <ArrowUp aria-hidden />)}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {result.rows.map((row) => (
                <tr key={row.id} data-selected={selected.includes(row.id)}>
                  <td>
                    <Checkbox
                      aria-label={`Selecionar ${row.name}`}
                      checked={selected.includes(row.id)}
                      onChange={() =>
                        setSelected(
                          selected.includes(row.id)
                            ? selected.filter((id) => id !== row.id)
                            : [...selected, row.id],
                        )
                      }
                    />
                  </td>
                  <th scope="row">
                    {row.name}
                    <code>{row.id}</code>
                  </th>
                  <td>
                    <span
                      className={styles.operationsBadge}
                      data-tone={row.status === 'Ativa' ? 'positive' : 'neutral'}
                    >
                      {row.status}
                    </span>
                  </td>
                  <td>{row.sales}</td>
                  <td className={styles.operationsMoney}>
                    {row.revenue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.total === 0 && (
            <DataState
              className={styles.state}
              variant="empty"
              title="Nenhuma oferta encontrada"
              description="Revise a busca ou o status selecionado."
              action={
                <Button
                  className={styles.secondary}
                  variant="outline"
                  onClick={() => {
                    setQuery('');
                    setStatus('Todas');
                    setPage(1);
                    setSelected([]);
                  }}
                >
                  Limpar filtros
                </Button>
              }
            />
          )}
        </section>
        <div className={styles.operationsPagination}>
          <span>
            {result.total} ofertas · página {result.page} de {result.pages}
          </span>
          <Button
            className={styles.secondary}
            variant="outline"
            disabled={result.page === 1}
            onClick={() => {
              setPage(result.page - 1);
              setSelected([]);
            }}
          >
            Anterior
          </Button>
          <Button
            className={styles.secondary}
            variant="outline"
            disabled={result.page === result.pages}
            onClick={() => {
              setPage(result.page + 1);
              setSelected([]);
            }}
          >
            Próxima
          </Button>
        </div>
        <output className={styles.feedback}>{message}</output>
      </CardContent>
    </Card>
  );
}

const exampleForm: DemoForm = {
  name: 'Aurora · campanha principal',
  url: 'https://exemplo.com',
  notes: 'Exemplo isolado: nenhuma oferta será cadastrada.',
  from: '2026-11-03',
  to: '2026-11-03',
  currency: 'BRL',
};

export function FormSpecimen() {
  const [form, setForm] = useState(exampleForm);
  const [errors, setErrors] = useState<ReturnType<typeof validateDemoForm>>({});
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState('');
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [message, setMessage] = useState('Nada é enviado ou armazenado fora desta página.');
  const [fileKey, setFileKey] = useState(0);
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const change = (patch: Partial<DemoForm>) => {
    setForm({ ...form, ...patch });
    setDirty(true);
    setMessage('Alterações não salvas.');
    setErrors({});
  };
  const reset = () => {
    clearTimeout(timer.current);
    setForm(exampleForm);
    setFile(null);
    setFileError('');
    setErrors({});
    setBusy(false);
    setDirty(false);
    setConfirmReset(false);
    setFileKey((value) => value + 1);
    setMessage('Exemplo restaurado.');
  };
  return (
    <Card className={styles.surface}>
      <CardHeader>
        <CardTitle>Formulário · configuração de oferta</CardTitle>
        <CardDescription>
          Validação, textarea, período real do TMX e arquivo opcional. O salvamento é somente
          simulado.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          ref={formRef}
          className={styles.formStack}
          noValidate
          aria-label="Configuração demonstrativa de oferta"
          aria-busy={busy}
          onSubmit={(event) => {
            event.preventDefault();
            if (busy) return;
            const nextErrors = validateDemoForm(form);
            const nextFileError = validateDemoFile(file);
            setErrors(nextErrors);
            setFileError(nextFileError);
            if (Object.keys(nextErrors).length || nextFileError) {
              setMessage('Revise os campos destacados. Nenhuma alteração foi salva.');
              requestAnimationFrame(() =>
                formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(),
              );
              return;
            }
            setBusy(true);
            setConfirmReset(false);
            setMessage('Simulando salvamento…');
            timer.current = setTimeout(() => {
              setBusy(false);
              setDirty(false);
              setMessage('Configuração validada na demonstração. Nada foi salvo no TMX.');
            }, 800);
          }}
        >
          <fieldset className={styles.operationsFields} disabled={busy}>
            <legend className={styles.srOnly}>Dados da oferta de exemplo</legend>
            <FormField id="reference-offer-name" label="Nome da oferta" error={errors.name}>
              <Input
                className={styles.input}
                value={form.name}
                maxLength={80}
                required
                onChange={(event) => change({ name: event.target.value })}
              />
            </FormField>
            <FormField id="reference-offer-url" label="Página HTTPS (opcional)" error={errors.url}>
              <Input
                className={styles.input}
                value={form.url}
                type="url"
                onChange={(event) => change({ url: event.target.value })}
              />
            </FormField>
            <FormField
              id="reference-offer-notes"
              label="Observações"
              error={errors.notes}
              help={`${form.notes.length}/1.000 caracteres`}
            >
              <textarea
                className={`${styles.input} ${styles.operationsTextarea}`}
                value={form.notes}
                maxLength={1000}
                onChange={(event) => change({ notes: event.target.value })}
              />
            </FormField>
            <fieldset
              className={styles.operationsFields}
              aria-describedby={errors.from ? 'reference-period-error' : undefined}
            >
              <legend className={styles.fieldLabel}>Período de consulta</legend>
              <DateRangeFilter
                className={styles.operationsRange}
                value={{ from: form.from, to: form.to }}
                onChange={(range) => change(range)}
                presets={[
                  {
                    id: 'today',
                    label: 'Hoje · exemplo',
                    getRange: () => ({ from: '2026-11-03', to: '2026-11-03' }),
                  },
                  {
                    id: 'month',
                    label: 'Este mês · exemplo',
                    getRange: () => ({ from: '2026-11-01', to: '2026-11-03' }),
                  },
                ]}
              />
              {errors.from && (
                <p id="reference-period-error" role="alert" className={styles.operationsError}>
                  {errors.from}
                </p>
              )}
            </fieldset>
            <fieldset className={styles.operationsRadios}>
              <legend className={styles.fieldLabel}>Moeda</legend>
              {['BRL', 'USD'].map((currency) => (
                <label key={currency}>
                  <input
                    type="radio"
                    name="reference-form-currency"
                    value={currency}
                    checked={form.currency === currency}
                    onChange={() => change({ currency })}
                  />
                  {currency}
                </label>
              ))}
            </fieldset>
            <FormField
              id="reference-offer-file"
              label="CSV opcional · até 2 MB"
              error={fileError}
              help="Só nome e tamanho são validados. Conteúdo não é lido nem enviado."
            >
              <Input
                key={fileKey}
                className={`${styles.input} ${styles.operationsFile}`}
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null;
                  setFile(next);
                  setFileError(validateDemoFile(next));
                  setDirty(true);
                  setMessage('Arquivo selecionado somente para demonstração.');
                }}
              />
            </FormField>
          </fieldset>
          <div className={styles.row}>
            <Button type="submit" className={styles.primary} disabled={busy}>
              {busy && <Loader2 className={styles.loginSpinner} aria-hidden />}
              {busy ? 'Validando…' : 'Salvar · demonstração'}
            </Button>
            <Button
              type="button"
              className={styles.secondary}
              variant="outline"
              disabled={busy}
              onClick={() => (dirty ? setConfirmReset(true) : reset())}
            >
              Restaurar exemplo
            </Button>
          </div>
          {confirmReset && (
            <div className={styles.operationsNotice}>
              <p>Descartar as alterações locais não salvas?</p>
              <div className={styles.row}>
                <Button type="button" className={styles.danger} variant="outline" onClick={reset}>
                  Descartar alterações
                </Button>
                <Button
                  type="button"
                  className={styles.secondary}
                  variant="outline"
                  onClick={() => setConfirmReset(false)}
                >
                  Continuar editando
                </Button>
              </div>
            </div>
          )}
          <output className={styles.feedback}>{message}</output>
        </form>
      </CardContent>
    </Card>
  );
}

export function OperationalSpecimen() {
  const [scene, setScene] = useState('Online');
  const [job, dispatch] = useReducer(jobStep, initialJob);
  const [message, setMessage] = useState(
    'Processamento local simulado; nenhum arquivo será enviado.',
  );
  const working = job.phase === 'queued' || job.phase === 'processing';
  useEffect(() => {
    if (!working || scene !== 'Online') return;
    const timer = setInterval(() => dispatch('tick'), 500);
    return () => clearInterval(timer);
  }, [working, scene]);
  const labels = {
    idle: 'Pronto para iniciar',
    queued: 'Na fila',
    processing: 'Processando',
    partial: 'Concluído parcialmente',
    ready: 'Concluído',
    cancelled: 'Cancelado',
  };
  return (
    <Card className={styles.surface}>
      <CardHeader>
        <CardTitle>Estados operacionais · importação</CardTitle>
        <CardDescription>
          Fila, progresso, falha parcial, recuperação e cancelamento. Falhas preservam o contexto.
        </CardDescription>
      </CardHeader>
      <CardContent className={styles.formStack}>
        <div className={styles.row} aria-label="Cenários de operação">
          {['Online', 'Desatualizado', 'Offline', 'Sem acesso', 'Erro', 'Vazio'].map((value) => (
            <Button
              key={value}
              className={styles.secondary}
              variant="outline"
              aria-pressed={scene === value}
              onClick={() => setScene(value)}
            >
              {value}
            </Button>
          ))}
        </div>
        {scene === 'Desatualizado' && (
          <div className={styles.operationsNotice} aria-live="polite" aria-atomic="true">
            <strong>Exibindo a última leitura de exemplo</strong>
            <p>
              A atualização não terminou. Os dados anteriores continuam disponíveis e estão
              desatualizados.
            </p>
            <Button
              className={styles.secondary}
              variant="outline"
              onClick={() => setScene('Online')}
            >
              Simular reconexão
            </Button>
          </div>
        )}
        {scene === 'Offline' && (
          <DataState
            className={styles.state}
            variant="error"
            title="Sem conexão nesta simulação"
            description="O processamento visual foi pausado. Nenhuma solicitação será reenviada automaticamente."
            suggestion="Retorne ao cenário Online para continuar a demonstração."
            action={
              <Button
                className={styles.secondary}
                variant="outline"
                onClick={() => setScene('Online')}
              >
                Simular reconexão
              </Button>
            }
          />
        )}
        {scene === 'Sem acesso' && (
          <DataState
            className={styles.state}
            variant="error"
            title="Você não tem acesso a esta operação"
            description="Peça permissão ao administrador da sua empresa."
            suggestion="A demonstração não altera permissões reais."
          />
        )}
        {scene === 'Erro' && (
          <DataState
            className={styles.state}
            variant="error"
            title="Não foi possível consultar a importação"
            description="O estado anterior foi preservado. Nenhuma operação foi repetida."
            suggestion="Tente consultar novamente; não reenvie o arquivo."
            technicalDetails={{ statusCode: 503, requestId: 'demo-job-001' }}
            onRetry={() => setScene('Online')}
          />
        )}
        {scene === 'Vazio' && (
          <DataState
            className={styles.state}
            variant="empty"
            title="Nenhuma importação neste escopo"
            description="Inicie um exemplo para visualizar a fila e o progresso."
            action={
              <Button
                className={styles.primary}
                onClick={() => {
                  dispatch('reset');
                  setScene('Online');
                }}
              >
                Voltar ao exemplo
              </Button>
            }
          />
        )}
        {!['Sem acesso', 'Erro', 'Vazio'].includes(scene) && (
          <div className={styles.operationsJob}>
            <output className={styles.operationsBadge}>{labels[job.phase]}</output>
            <h4>DEMO-JOB-001 · 20 registros fictícios</h4>
            <label htmlFor="reference-job-progress" className={styles.fieldLabel}>
              Progresso simulado: {job.progress}%
            </label>
            <progress
              id="reference-job-progress"
              className={styles.operationsProgress}
              max={100}
              value={job.progress}
            >
              {job.progress}%
            </progress>
            {job.phase === 'partial' && (
              <div className={styles.operationsNotice} aria-live="polite" aria-atomic="true">
                <strong>17 registros aceitos; 3 precisam de revisão</strong>
                <p>
                  Falha de validação simulada. Tentar novamente processa somente os 3 pendentes; os
                  17 aceitos não são repetidos.
                </p>
                <Button
                  className={styles.secondary}
                  variant="outline"
                  disabled={scene !== 'Online'}
                  onClick={() => dispatch('retry')}
                >
                  Reprocessar 3 pendentes · simulação
                </Button>
              </div>
            )}
            {job.phase === 'ready' && (
              <output className={styles.operationsSuccess}>
                20 registros concluídos na simulação. Nenhum dado foi importado no TMX.
              </output>
            )}
            {job.phase === 'cancelled' && (
              <output>Demonstração cancelada. Este botão não cancela jobs reais.</output>
            )}
            <div className={styles.row}>
              <Button
                className={styles.primary}
                disabled={working || job.phase === 'partial' || scene !== 'Online'}
                onClick={() => dispatch('start')}
              >
                Iniciar simulação
              </Button>
              <Button
                className={styles.secondary}
                variant="outline"
                disabled={!working}
                onClick={() => dispatch('cancel')}
              >
                Cancelar simulação
              </Button>
              {job.phase === 'ready' && (
                <Button
                  className={styles.secondary}
                  variant="outline"
                  onClick={() =>
                    setMessage(
                      'Resultado de exemplo: 20 aceitos, 0 pendentes. Nenhum arquivo real foi gerado.',
                    )
                  }
                >
                  Ver resumo do resultado
                </Button>
              )}
            </div>
          </div>
        )}
        <output className={styles.feedback}>{message}</output>
      </CardContent>
    </Card>
  );
}
