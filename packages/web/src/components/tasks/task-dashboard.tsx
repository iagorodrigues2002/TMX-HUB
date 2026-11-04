'use client';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { taskApi } from '@/lib/api-client/endpoints-tasks';
import { endpoints as userApi } from '@/lib/api-client/endpoints-users';
import { useAuth } from '@/lib/auth-context';
import { callInputDate, callStartIso } from '@/lib/call-dashboard';
import { summarizeTasks, taskDate, taskStatusLabel } from '@/lib/task-dashboard';
import {
  type ManagedTask,
  TASK_SECTORS,
  TaskCreateSchema,
  type TaskPerson,
  type TaskStatus,
} from '@page-cloner/shared';
import { useQuery } from '@tanstack/react-query';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCheck,
  ChevronDown,
  Clock3,
  ListTodo,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import styles from './task-dashboard.module.css';
import { demoTaskPeople, demoTasks } from './task-fixtures';

const field =
  'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary';
const priorityLabel = { urgent: 'Urgente', high: 'Alta', normal: 'Normal', low: 'Baixa' };

export function TaskDashboard({
  preview = false,
  companyId,
  companyAccess = false,
}: { preview?: boolean; companyId?: string; companyAccess?: boolean }) {
  const { user, loading } = useAuth();
  const allowed = preview || companyAccess || user?.role === 'admin';
  const [page, setPage] = useState(1);
  const [demo, setDemo] = useState(demoTasks);
  const [peopleDemo, setPeopleDemo] = useState(demoTaskPeople);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [personId, setPersonId] = useState('all');
  const [status, setStatus] = useState('all');
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);
  const tasksQuery = useQuery({
    queryKey: ['managed-tasks', user?.id, companyId, page, personId, status, query],
    queryFn: () =>
      taskApi.list(page, {
        person: personId,
        status,
        q: query,
        ...(companyId ? { companyId } : {}),
      }),
    enabled: allowed && !preview,
    refetchInterval: 15000,
    retry: false,
  });
  const peopleQuery = useQuery({
    queryKey: ['task-people', user?.id, companyId],
    queryFn: () => taskApi.people(companyId),
    enabled: allowed && !preview,
    retry: false,
  });
  const tasks = preview ? demo : (tasksQuery.data?.tasks ?? []);
  const people = preview ? peopleDemo : (peopleQuery.data ?? []);
  const configured = preview || !!tasksQuery.data?.configured;
  const native = tasksQuery.data?.managementMode === 'native';
  const [editingTask, setEditingTask] = useState<ManagedTask | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [addingPerson, setAddingPerson] = useState(false);
  const usersQuery = useQuery({
    queryKey: ['task-link-users', user?.id, companyId],
    queryFn: () => (companyId ? taskApi.users(companyId) : userApi.listUsers()),
    enabled: allowed && !preview && addingPerson,
    retry: false,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createKey, setCreateKey] = useState<string | null>(null);
  const historyQuery = useQuery({
    queryKey: [
      'native-task-history',
      user?.id,
      expanded,
      tasksQuery.data?.tasks.find((t) => t.id === expanded)?.updatedAt,
    ],
    queryFn: () => taskApi.history(expanded!),
    enabled: allowed && native && !!expanded,
    retry: false,
  });
  const now = Date.now();
  const totals =
    !preview && tasksQuery.data
      ? tasksQuery.data.summary
      : {
          open: tasks.filter((t) => t.status !== 'done').length,
          progress: tasks.filter((t) => t.status === 'progress').length,
          overdue: tasks.filter((t) => t.status !== 'done' && t.dueAt && Date.parse(t.dueAt) < now)
            .length,
          done: tasks.filter((t) => t.status === 'done').length,
        };
  const summaries = useMemo(
    () =>
      summarizeTasks(tasks, people).map((item) => ({
        ...item,
        ...(!preview
          ? (tasksQuery.data?.peopleSummary.find((p) => p.id === item.person.id) ?? {
              open: 0,
              progress: 0,
              done: 0,
              overdue: 0,
            })
          : {}),
      })),
    [tasks, people, preview, tasksQuery.data?.peopleSummary],
  );
  const filtered = tasks.filter(
    (task) =>
      (personId === 'all' || task.assignees.some((p) => p.id === personId)) &&
      (status === 'all' ||
        (status === 'overdue'
          ? task.status !== 'done' && task.dueAt && Date.parse(task.dueAt) < now
          : task.status === status)) &&
      `${task.title} ${task.sector} ${task.offer ?? ''} ${task.assignees.map((p) => p.name).join(' ')}`
        .toLocaleLowerCase('pt-BR')
        .includes(search.toLocaleLowerCase('pt-BR')),
  );
  const refresh = async () => {
    await Promise.all([tasksQuery.refetch(), peopleQuery.refetch()]);
  };

  async function changeStatus(task: ManagedTask, next: TaskStatus) {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      if (preview) {
        const at = new Date().toISOString();
        setDemo((items) =>
          items.map((item) =>
            item.id === task.id
              ? {
                  ...item,
                  status: next,
                  updatedAt: at,
                  startedAt: next === 'progress' ? (item.startedAt ?? at) : item.startedAt,
                  completedAt: next === 'done' ? at : null,
                }
              : item,
          ),
        );
      } else {
        await taskApi.status(task.id, next, crypto.randomUUID(), task.revision);
        await refresh();
        setNotice(
          native
            ? 'Status salvo no TMX. Acompanhe a entrega ao Discord nos detalhes da tarefa.'
            : 'Alteração solicitada. O status só muda após confirmação da automação.',
        );
      }
    } catch {
      setError('Não foi possível confirmar a alteração. Atualize antes de tentar novamente.');
    } finally {
      setBusy(false);
    }
  }

  async function createTask(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    const form = new FormData(event.currentTarget);
    const due = String(form.get('due') ?? '');
    let dueAt: string | null;
    try {
      dueAt = due ? callStartIso(due) : null;
    } catch {
      setError('Confira a data e o horário do prazo.');
      return;
    }
    const parsed = TaskCreateSchema.safeParse({
      companyId,
      title: form.get('title'),
      description: form.get('description'),
      sector: editingTask?.sector ?? form.get('sector'),
      offer: editingTask ? editingTask.offer : String(form.get('offer') ?? '').trim() || null,
      priority: form.get('priority'),
      assigneeIds: form.getAll('assignees'),
      dueAt,
    });
    if (!parsed.success) {
      setError('Preencha tarefa, setor e pelo menos um responsável. Confira os demais campos.');
      return;
    }
    setBusy(true);
    const key = createKey ?? crypto.randomUUID();
    setCreateKey(key);
    try {
      if (preview) {
        const at = new Date().toISOString();
        const input = parsed.data;
        setDemo((items) => [
          {
            id: crypto.randomUUID(),
            clickupId: null,
            discordMessageId: null,
            discordChannelId: null,
            title: input.title,
            description: input.description,
            sector: input.sector,
            offer: input.offer,
            priority: input.priority,
            dueAt: input.dueAt,
            assignees: people.filter((p) => input.assigneeIds.includes(p.id)),
            status: 'pending',
            source: 'tmx',
            receivedAt: at,
            assignedAt: at,
            assignmentReceivedAt: Object.fromEntries(input.assigneeIds.map((id) => [id, at])),
            startedAt: null,
            completedAt: null,
            updatedAt: at,
            syncState: 'synced',
            discordState: 'synced',
          },
          ...items,
        ]);
      } else if (editingTask) {
        const { sector: _sector, offer: _offer, companyId: _companyId, ...fields } = parsed.data;
        if (!editingTask.revision) throw Error('Revisão da tarefa ausente');
        await taskApi.edit(editingTask.id, { ...fields, revision: editingTask.revision }, key);
        await refresh();
      } else {
        await taskApi.create(parsed.data, key);
        await refresh();
      }
      setCreating(false);
      setEditingTask(null);
      setCreateKey(null);
      setNotice(
        preview
          ? 'Tarefa demonstrativa criada somente nesta página.'
          : native
            ? 'Tarefa salva no TMX. A entrega no Discord é acompanhada separadamente.'
            : 'Solicitação salva. Aguardando confirmação do ClickUp e do Discord.',
      );
    } catch {
      setError(
        'Criação não confirmada. A chave desta solicitação foi preservada para evitar duplicação. Não crie outra antes de conferir a lista.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function savePerson(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const person: TaskPerson = {
      id: crypto.randomUUID(),
      name: String(data.get('name')).trim(),
      clickupId: native ? null : String(data.get('clickupId') ?? '').trim() || null,
      discordId: String(data.get('discordId')).trim() || null,
      userId: String(data.get('userId') ?? '').trim() || null,
    };
    const existing = people.find((p) =>
      native
        ? person.userId && p.userId === person.userId
        : person.clickupId && p.clickupId === person.clickupId,
    );
    if (existing) {
      person.id = existing.id;
      if (native) person.clickupId = existing.clickupId;
      if (!data.get('userId')) person.userId = existing.userId ?? null;
    }
    if (data.get('userId') === '__clear') person.userId = null;
    setBusy(true);
    setError('');
    try {
      if (preview) setPeopleDemo((items) => [...items.filter((p) => p.id !== person.id), person]);
      else {
        await taskApi.savePerson(person);
        await peopleQuery.refetch();
      }
      setAddingPerson(false);
    } catch {
      setError('Não foi possível vincular a pessoa. Confira os IDs e se já estão cadastrados.');
    } finally {
      setBusy(false);
    }
  }

  if (!preview && loading) return <output>Validando acesso…</output>;
  if (!allowed)
    return (
      <div role="alert" className="glass-card rounded-xl border border-border bg-card p-8">
        <ShieldCheck aria-hidden />
        <h1 className="mt-3 text-xl font-semibold">Acesso às tarefas não autorizado</h1>
        <p>Nenhum dado de tarefas foi solicitado.</p>
      </div>
    );

  return (
    <div className={`${styles.dashboard} space-y-5`}>
      <header className={styles.pageHeader} data-motion-panel>
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[.18em] text-primary">
            <ListTodo className="h-4 w-4" aria-hidden /> Operação da equipe
          </p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Gestão de tarefas</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            {native
              ? 'Responsáveis, prazos e histórico. Do recebimento à conclusão, no TMX.'
              : 'Quem está fazendo o quê, desde o recebimento até a conclusão.'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            disabled={!preview && !companyId}
            onClick={() => setAddingPerson(true)}
          >
            <Users aria-hidden /> Vincular pessoa
          </Button>
          <Button
            variant="outline"
            disabled={preview || tasksQuery.isFetching}
            onClick={refresh}
            aria-label="Atualizar tarefas"
          >
            <RefreshCw aria-hidden />
          </Button>
          <Button
            disabled={!configured || (!preview && !companyId)}
            onClick={() => {
              setError('');
              setEditingTask(null);
              setCreateKey(null);
              setCreating(true);
            }}
          >
            <Plus aria-hidden /> Nova tarefa
          </Button>
        </div>
      </header>
      {!preview && !companyId && (
        <p className="text-sm text-muted-foreground">
          Selecione uma empresa para criar tarefas e vincular pessoas. Registros antigos sem empresa
          permanecem acessíveis apenas aos administradores globais.
        </p>
      )}
      {preview && (
        <p className="rounded-xl border border-primary/30 bg-primary/10 p-3 text-sm">
          Prévia local interativa · pessoas, datas e tarefas fictícias. Nenhum envio para Discord ou
          ClickUp.
        </p>
      )}
      {!preview && (!configured || tasksQuery.error || peopleQuery.error) && (
        <div role="alert" className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm">
          <strong>Integração ainda não disponível neste ambiente.</strong>
          <p className="mt-1">
            A API, a migração e o vínculo do n8n precisam ser habilitados. Dados demonstrativos não
            substituem tarefas reais.
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-lg border border-danger/30 p-3 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <output className="block rounded-lg border border-primary/30 p-3 text-sm">{notice}</output>
      )}
      <section aria-label="Resumo geral das tarefas" className={styles.summary} data-motion-panel>
        {[
          { label: 'Em aberto', count: totals.open, icon: ListTodo, color: 'text-primary' },
          { label: 'Em progresso', count: totals.progress, icon: Clock3, color: 'text-primary' },
          { label: 'Atrasadas', count: totals.overdue, icon: AlertCircle, color: 'text-warning' },
          { label: 'Concluídas', count: totals.done, icon: CheckCheck, color: 'text-success' },
        ].map((stat) => (
          <div key={stat.label} className={styles.stat}>
            <div>
              <p className="text-xs text-muted-foreground">{stat.label}</p>
              <p className={`mt-1 text-3xl font-semibold tabular-nums ${stat.color}`}>
                {stat.count}
              </p>
            </div>
            <span className={`${styles.statIcon} ${stat.color}`}>
              <stat.icon className="h-5 w-5" aria-hidden />
            </span>
          </div>
        ))}
      </section>
      <div className="grid items-start gap-4 xl:grid-cols-[260px_minmax(0,1fr)]" data-motion-panel>
        <aside className={`${styles.surface} p-4`}>
          <h2 className="mb-1 font-semibold">Pessoas e carga de trabalho</h2>
          <p className="mb-4 text-xs text-muted-foreground">
            Cada tarefa compartilhada aparece para todos os responsáveis.
          </p>
          <Button
            variant={personId === 'all' ? 'default' : 'ghost'}
            className="mb-2 w-full justify-start"
            onClick={() => {
              setPersonId('all');
              setPage(1);
            }}
          >
            Todas as pessoas <span className="ml-auto">{people.length}</span>
          </Button>
          <div className="space-y-2">
            {summaries.map(({ person, open, progress, done, overdue }) => (
              <button
                key={person.id}
                type="button"
                aria-pressed={personId === person.id}
                onClick={() => {
                  setPersonId(person.id);
                  setPage(1);
                }}
                className={`${styles.person} w-full rounded-xl border p-3 text-left ${personId === person.id ? 'border-primary bg-primary/10' : 'border-border hover:bg-muted'}`}
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                    {person.name
                      .split(' ')
                      .slice(0, 2)
                      .map((word) => word[0])
                      .join('')}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{person.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {open} abertas · {done} concluídas
                    </p>
                  </div>
                </div>
                <p className="mt-3 flex justify-between text-xs">
                  <span className="text-sky-400">{progress} em progresso</span>
                  <span className={overdue ? 'text-warning' : 'text-muted-foreground'}>
                    {overdue} atrasadas
                  </span>
                </p>
              </button>
            ))}
            {!people.length && (
              <p className="p-3 text-sm text-muted-foreground">
                {native
                  ? 'Vincule contas TMX para atribuir tarefas.'
                  : 'Vincule as pessoas do ClickUp para começar.'}
              </p>
            )}
          </div>
        </aside>
        <section className={`${styles.surface} min-w-0`}>
          <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
            <div className="relative min-w-48 flex-1">
              <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden />
              <input
                aria-label="Buscar tarefa, oferta ou setor"
                className={`${field} pl-9`}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar tarefa, oferta ou setor…"
              />
            </div>
            <select
              aria-label="Filtrar status"
              className={`${field} sm:w-44`}
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="all">Todos os status</option>
              <option value="pending">Pendentes</option>
              <option value="progress">Em progresso</option>
              <option value="overdue">Atrasadas</option>
              <option value="done">Concluídas</option>
            </select>
          </div>
          {!preview && tasksQuery.isLoading && (
            <output className="flex items-center gap-2 p-5">
              <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />{' '}
              Carregando tarefas…
            </output>
          )}
          <div className="divide-y divide-border">
            {filtered.map((task) => (
              <article key={task.id} className={styles.task}>
                <button
                  type="button"
                  className={`${styles.taskTrigger} flex w-full items-start gap-3 p-4 text-left sm:p-5`}
                  aria-expanded={expanded === task.id}
                  onClick={() => setExpanded(expanded === task.id ? null : task.id)}
                >
                  <span
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${task.status === 'done' ? 'bg-success/10' : task.status === 'progress' ? 'bg-sky-400' : 'bg-warning/10'}`}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{task.title}</h3>
                      <Badge variant={task.status === 'done' ? 'success' : 'default'}>
                        {taskStatusLabel[task.status]}
                      </Badge>
                      {task.syncState !== 'synced' && (
                        <Badge variant="warning">
                          {task.syncState === 'queued'
                            ? 'Aguardando automação'
                            : 'Requer conferência'}
                        </Badge>
                      )}
                      {native && task.discordState !== 'synced' && (
                        <Badge variant="warning">
                          {task.discordState === 'failed'
                            ? 'Discord requer conferência'
                            : 'Discord pendente'}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {task.sector} · {task.offer ?? 'Sem oferta'} · Prioridade{' '}
                      {priorityLabel[task.priority]}
                    </p>
                    <p className="mt-2 text-sm">
                      {task.assignees.map((p) => p.name).join(' · ') || 'Sem responsável'}
                    </p>
                    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-3">
                      <span>
                        Recebida no TMX
                        <br />
                        <strong className="font-medium text-foreground">
                          {taskDate(
                            personId === 'all'
                              ? task.receivedAt
                              : (task.assignmentReceivedAt[personId] ?? null),
                          )}
                        </strong>
                      </span>
                      <span>
                        Prazo
                        <br />
                        <strong className="font-medium text-foreground">
                          {taskDate(task.dueAt)}
                        </strong>
                      </span>
                      <span>
                        Concluída
                        <br />
                        <strong className="font-medium text-foreground">
                          {taskDate(task.completedAt)}
                        </strong>
                      </span>
                    </div>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 shrink-0 transition-transform motion-reduce:transition-none ${expanded === task.id ? 'rotate-180' : ''}`}
                    aria-hidden
                  />
                </button>
                {expanded === task.id && (
                  <div className={`${styles.details} space-y-4 px-5 pb-5 pl-10`}>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {task.description || 'Sem descrição.'}
                    </p>
                    <dl className="grid gap-3 text-xs sm:grid-cols-3">
                      <div>
                        <dt className="text-muted-foreground">Atribuída</dt>
                        <dd>{taskDate(task.assignedAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Início confirmado</dt>
                        <dd>{taskDate(task.startedAt)}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Origem / Discord</dt>
                        <dd>
                          {task.source} ·{' '}
                          {task.discordState === 'synced'
                            ? 'sincronizado'
                            : task.discordState === 'failed'
                              ? 'requer conferência'
                              : 'pendente'}
                        </dd>
                      </div>
                    </dl>
                    <div className="flex flex-wrap gap-2">
                      {(['pending', 'progress', 'done'] as const).map((next) => (
                        <Button
                          key={next}
                          size="sm"
                          variant={task.status === next ? 'default' : 'outline'}
                          disabled={
                            busy || (!preview && (task.syncState !== 'synced' || !configured))
                          }
                          onClick={() => changeStatus(task, next)}
                        >
                          {taskStatusLabel[next]}
                        </Button>
                      ))}
                      {task.clickupId && (
                        <Button asChild size="sm" variant="ghost">
                          <a
                            href={`https://app.clickup.com/t/${encodeURIComponent(task.clickupId)}`}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Abrir no ClickUp <ArrowUpRight aria-hidden />
                          </a>
                        </Button>
                      )}
                      {native && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy}
                          onClick={() => {
                            setEditingTask(task);
                            setCreateKey(null);
                            setError('');
                            setCreating(true);
                          }}
                        >
                          <Pencil aria-hidden className="h-4 w-4" />
                          Editar tarefa
                        </Button>
                      )}
                    </div>
                    {native && (
                      <details className="border-t border-border pt-3 text-sm">
                        <summary className="cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                          Histórico de alterações
                        </summary>
                        {historyQuery.isLoading && <output>Carregando histórico…</output>}
                        {historyQuery.error && (
                          <p role="alert">Não foi possível carregar o histórico.</p>
                        )}
                        <ol className="mt-3 space-y-2">
                          {historyQuery.data?.map((event) => (
                            <li key={event.event_id} className="text-xs text-muted-foreground">
                              {taskDate(event.received_at)} ·{' '}
                              {(
                                {
                                  created: 'Criada',
                                  edited: 'Editada',
                                  status: 'Status alterado',
                                } as Record<string, string>
                              )[event.body.action ?? ''] ?? 'Atualizada'}{' '}
                              ·{' '}
                              {people.find((p) => p.userId === event.body.actorId)?.name ??
                                'Usuário TMX'}{' '}
                              · {taskStatusLabel[event.body.task.status]}
                            </li>
                          ))}
                        </ol>
                      </details>
                    )}
                  </div>
                )}
              </article>
            ))}
            {!filtered.length && !tasksQuery.isLoading && (
              <div className="grid min-h-56 place-items-center p-6 text-center">
                <div>
                  <ListTodo className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
                  <h3 className="mt-3 font-medium">Nenhuma tarefa nesta seleção</h3>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Ajuste os filtros ou crie uma tarefa.
                  </p>
                </div>
              </div>
            )}
          </div>
          <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border p-4 text-xs text-muted-foreground">
            <span>
              {filtered.length} tarefas nesta página · Datas em São Paulo
              {!preview && ` · ${tasksQuery.data?.total ?? 0} no total`}
            </span>
            {!preview && (
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Anterior
                </Button>
                <span>Página {page}</span>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={page * 50 >= (tasksQuery.data?.total ?? 0)}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Próxima
                </Button>
              </div>
            )}
          </footer>
        </section>
      </div>
      <Dialog
        open={creating}
        onOpenChange={(open) => {
          if (!busy) setCreating(open);
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingTask ? 'Editar tarefa' : 'Nova tarefa'}</DialogTitle>
            <DialogDescription>
              Mesmo modelo do Discord. Todos os responsáveis receberão a mesma tarefa.
            </DialogDescription>
          </DialogHeader>
          <form
            key={editingTask?.id ?? 'new'}
            className="space-y-4"
            onSubmit={(event) => void createTask(event)}
          >
            <label className="block space-y-1 text-sm">
              Tarefa
              <input
                className={field}
                name="title"
                required
                minLength={3}
                maxLength={200}
                defaultValue={editingTask?.title}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1 text-sm">
                Setor
                <select
                  className={field}
                  name="sector"
                  required
                  defaultValue={editingTask?.sector ?? 'Spy'}
                  disabled={!!editingTask}
                >
                  {TASK_SECTORS.map((sector) => (
                    <option key={sector} value={sector}>
                      {sector}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                Oferta
                <input
                  className={field}
                  name="offer"
                  maxLength={100}
                  placeholder="Opcional"
                  defaultValue={editingTask?.offer ?? ''}
                  disabled={!!editingTask}
                />
              </label>
            </div>
            <label className="block space-y-1 text-sm">
              Descrição
              <textarea
                name="description"
                className={`${field} min-h-24`}
                maxLength={10000}
                defaultValue={editingTask?.description}
              />
            </label>
            <fieldset className="rounded-lg border border-border p-3">
              <legend className="px-1 text-sm">Responsáveis</legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {people.map((p) => (
                  <label key={p.id} className="flex min-h-10 items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="assignees"
                      value={p.id}
                      disabled={native ? !p.userId : !p.clickupId}
                      defaultChecked={editingTask?.assignees.some((a) => a.id === p.id)}
                    />
                    {p.name}
                    {(native ? !p.userId : !p.clickupId) && ' (sem vínculo)'}
                  </label>
                ))}
              </div>
              {!people.length && (
                <p className="text-xs text-muted-foreground">Vincule uma pessoa antes de criar.</p>
              )}
            </fieldset>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1 text-sm">
                Prioridade
                <select
                  name="priority"
                  defaultValue={editingTask?.priority ?? 'normal'}
                  className={field}
                >
                  {Object.entries(priorityLabel).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1 text-sm">
                Prazo · São Paulo
                <input
                  name="due"
                  type="datetime-local"
                  className={field}
                  defaultValue={editingTask?.dueAt ? callInputDate(editingTask.dueAt) : ''}
                />
              </label>
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setCreating(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={busy || !people.some((p) => (native ? p.userId : p.clickupId))}
              >
                {busy
                  ? 'Salvando…'
                  : editingTask
                    ? 'Salvar alterações'
                    : preview
                      ? 'Criar exemplo local'
                      : 'Criar tarefa'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={addingPerson}
        onOpenChange={(open) => {
          if (!busy) setAddingPerson(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Vincular pessoa</DialogTitle>
            <DialogDescription>
              Use os IDs reais para evitar confundir pessoas com nomes parecidos. Este vínculo não
              concede acesso ao TMX.
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={savePerson}>
            <label className="block text-sm">
              Nome
              <input name="name" required maxLength={100} className={field} />
            </label>
            {!native && (
              <label className="block text-sm">
                ID do usuário ClickUp
                <input
                  name="clickupId"
                  required
                  pattern="[0-9]+"
                  className={field}
                  disabled={!preview && user?.role !== 'admin'}
                />
              </label>
            )}
            <label className="block text-sm">
              ID do usuário Discord
              <input
                name="discordId"
                pattern="[0-9]+"
                className={field}
                disabled={!preview && user?.role !== 'admin'}
              />
              {!preview && user?.role !== 'admin' && (
                <span className="mt-1 block text-xs text-muted-foreground">
                  Por segurança, somente administradores globais validam identidades do Discord.
                  Você pode adicionar membros sem esse vínculo e usar os responsáveis já
                  cadastrados.
                </span>
              )}
            </label>
            <label className="block text-sm">
              {native
                ? 'Conta TMX do responsável'
                : 'Conta TMX para receber lembretes privados de calls'}
              <select
                name="userId"
                className={field}
                defaultValue=""
                required={native}
                disabled={preview || usersQuery.isLoading || !!usersQuery.error}
              >
                <option value="">
                  {native
                    ? 'Selecione uma conta TMX'
                    : 'Manter vínculo atual (ou sem vínculo, se nova pessoa)'}
                </option>
                {!native && <option value="__clear">Remover vínculo com a conta TMX</option>}
                {(usersQuery.data ?? []).map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.name} · {account.email}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">
                {native
                  ? 'A conta recebe suas tarefas e lembretes no TMX. O ID Discord é opcional e permite menções e botões no Discord.'
                  : 'Sem vínculo, esta pessoa recebe somente avisos do Discord. Este vínculo não concede permissões.'}
              </span>
            </label>
            {usersQuery.error && (
              <p role="alert" className="text-sm text-danger">
                Não foi possível listar as contas TMX. Tente novamente antes de salvar o vínculo.
              </p>
            )}
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
            <Button type="submit" disabled={busy || (!preview && !!usersQuery.error)}>
              {busy ? 'Salvando…' : 'Salvar vínculo'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
