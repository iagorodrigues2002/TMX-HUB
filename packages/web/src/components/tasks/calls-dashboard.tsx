'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { callApi } from '@/lib/api-client/endpoints-calls';
import { taskApi } from '@/lib/api-client/endpoints-tasks';
import { useAuth } from '@/lib/auth-context';
import {
  callDate,
  callInputDate,
  callStartIso,
  parseCallReminders,
  reminderLabel,
} from '@/lib/call-dashboard';
import { CallCreateSchema, type ManagedCall } from '@page-cloner/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  CheckCheck,
  ExternalLink,
  Plus,
  RefreshCw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useRef, useState } from 'react';
import styles from './task-dashboard.module.css';

const field =
  'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary';
const statusLabels = { scheduled: 'Agendada', completed: 'Realizada', cancelled: 'Cancelada' };
const syncLabels = {
  queued: 'Aguardando integração',
  synced: 'ClickUp e Discord confirmados',
  failed: 'Falha na integração',
};

export function CallsDashboard() {
  const { user, loading } = useAuth();
  const allowed = user?.role === 'admin';
  const [filter, setFilter] = useState('scheduled');
  const [editing, setEditing] = useState<ManagedCall | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [confirmation, setConfirmation] = useState<{
    call: ManagedCall;
    action: 'cancel' | 'complete';
  } | null>(null);
  const key = useRef<string | null>(null);
  const pending = useRef(false);
  const callsQuery = useQuery({
    queryKey: ['managed-calls', user?.id, filter],
    queryFn: () => callApi.list(filter),
    enabled: allowed,
    refetchInterval: 15000,
    retry: false,
  });
  const peopleQuery = useQuery({
    queryKey: ['task-people', user?.id],
    queryFn: taskApi.people,
    enabled: allowed,
    retry: false,
  });
  const calls = callsQuery.data?.calls ?? [];
  const people = peopleQuery.data ?? [];

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const parsed = CallCreateSchema.safeParse({
        title: form.get('title'),
        description: form.get('description'),
        message: form.get('message'),
        meetingUrl: form.get('meetingUrl'),
        startsAt: callStartIso(String(form.get('startsAt') ?? '')),
        durationMinutes: Number(form.get('durationMinutes')),
        participantIds: form.getAll('participants'),
        reminderMinutes: parseCallReminders(String(form.get('reminders') ?? '')),
      });
      if (!parsed.success) {
        setError(
          'Confira título, participantes, link HTTPS, data e lembretes (minutos únicos entre 0 e 1440).',
        );
        return;
      }
      pending.current = true;
      setBusy(true);
      key.current ??= crypto.randomUUID();
      await callApi.save(parsed.data, key.current, editing ?? undefined);
      setOpen(false);
      key.current = null;
      setNotice(
        'Agendamento salvo. A sincronização só será confirmada após o retorno do ClickUp e do Discord.',
      );
      await callsQuery.refetch();
    } catch {
      if (!pending.current) {
        setError('Confira a data, o horário e os lembretes antes de salvar.');
        return;
      }
      setError(
        'Não foi possível confirmar o agendamento. Atualize a lista antes de repetir; a chave foi preservada para evitar duplicação. Se outra pessoa editou esta call, feche e abra a edição novamente.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function changeStatus() {
    if (!confirmation || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    key.current ??= crypto.randomUUID();
    try {
      await callApi.status(
        confirmation.call.id,
        confirmation.call.revision,
        confirmation.action,
        key.current,
      );
      key.current = null;
      setConfirmation(null);
      setNotice(
        'Alteração salva. Os avisos e a integração serão atualizados sem criar outra call.',
      );
      await callsQuery.refetch();
    } catch {
      setError(
        'Alteração não confirmada. Atualize a lista e confira o estado da call antes de tentar novamente.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  if (loading) return <output>Validando acesso…</output>;
  if (!allowed)
    return (
      <div role="alert" className="rounded-xl border border-border bg-card p-8">
        <ShieldCheck aria-hidden />
        <h1 className="mt-3 text-xl font-semibold">Acesso exclusivo para administradores</h1>
        <p>Nenhum agendamento foi solicitado.</p>
      </div>
    );

  return (
    <section className={`${styles.dashboard} space-y-5`} aria-label="Gestão de calls">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight">
            <CalendarDays className="text-primary" aria-hidden />
            Agenda de calls
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Agende no TMX. Acompanhe os registros no ClickUp e os avisos no Calendário de Calls do
            Discord.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            aria-label="Atualizar calls"
            disabled={callsQuery.isFetching}
            onClick={() => void callsQuery.refetch()}
          >
            <RefreshCw aria-hidden />
          </Button>
          <Button
            disabled={!callsQuery.data || !people.length}
            onClick={() => {
              setEditing(null);
              setError('');
              key.current = null;
              setOpen(true);
            }}
          >
            <Plus aria-hidden />
            Nova call
          </Button>
        </div>
      </header>
      <p className="text-xs text-muted-foreground">
        Datas e horários de São Paulo. Reagendamentos invalidam os lembretes da versão anterior.
      </p>
      {error && (
        <p role="alert" className="rounded-lg border border-red-500/30 p-3 text-sm text-red-500">
          {error}
        </p>
      )}
      {notice && (
        <output className="block rounded-lg border border-primary/30 p-3 text-sm">{notice}</output>
      )}
      {(callsQuery.error || peopleQuery.error) && (
        <p
          role="alert"
          className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm"
        >
          Não foi possível consultar a agenda. Confira a API e a configuração da integração. Dados
          demonstrativos não substituem calls reais.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex items-center gap-3 text-sm">
          Mostrar
          <select className={field} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="scheduled">Agendadas</option>
            <option value="completed">Realizadas</option>
            <option value="cancelled">Canceladas</option>
            <option value="all">Todas</option>
          </select>
        </label>
        <span className="text-sm text-muted-foreground">{callsQuery.data?.total ?? 0} calls</span>
      </div>
      {callsQuery.isLoading && <output>Consultando agenda…</output>}
      {!callsQuery.isLoading && !callsQuery.error && calls.length === 0 && (
        <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center">
          <CalendarDays className="mx-auto mb-3 text-primary" aria-hidden />
          <h2 className="font-medium">Nenhuma call nesta seleção</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Cadastre uma call e escolha quem precisa receber os lembretes.
          </p>
        </div>
      )}
      <div className="space-y-3">
        {calls.map((call) => (
          <article key={call.id} className="rounded-xl border border-border bg-card p-5">
            <div className="flex flex-wrap justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <h2 className="break-words text-lg font-semibold">{call.title}</h2>
                  <span
                    className={`rounded-full border px-2 py-1 text-xs ${call.status === 'cancelled' ? 'text-muted-foreground' : call.status === 'completed' ? 'text-emerald-500' : 'text-primary'}`}
                  >
                    {statusLabels[call.status]}
                  </span>
                </div>
                <p className="mt-2 font-medium tabular-nums">
                  {callDate(call.startsAt)} · {call.durationMinutes} minutos
                </p>
              </div>
              <p
                className={`text-xs ${call.syncState === 'failed' ? 'text-red-500' : 'text-muted-foreground'}`}
              >
                {syncLabels[call.syncState]}
              </p>
            </div>
            <p className="mt-3 flex items-start gap-2 text-sm">
              <Users className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              {call.participants.map((p) => p.name).join(' · ')}
            </p>
            {call.description && (
              <p className="mt-3 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                {call.description}
              </p>
            )}
            <p className="mt-3 text-xs text-muted-foreground">
              Lembretes: {call.reminderMinutes.map(reminderLabel).join(' · ') || 'Nenhum'}
            </p>
            {call.message && (
              <p className="mt-2 whitespace-pre-wrap break-words border-l-2 border-primary/40 pl-3 text-sm">
                {call.message}
              </p>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild variant="outline">
                <a href={call.meetingUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink aria-hidden />
                  Entrar na call
                </a>
              </Button>
              {call.clickupId && (
                <Button asChild variant="ghost">
                  <a
                    href={`https://app.clickup.com/t/${encodeURIComponent(call.clickupId)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Abrir no ClickUp
                  </a>
                </Button>
              )}
              {call.status === 'scheduled' && (
                <>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setEditing(call);
                      key.current = null;
                      setError('');
                      setOpen(true);
                    }}
                  >
                    Editar / reagendar
                  </Button>
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      key.current = null;
                      setConfirmation({ call, action: 'complete' });
                    }}
                  >
                    <CheckCheck aria-hidden />
                    Marcar realizada
                  </Button>
                  <Button
                    variant="ghost"
                    disabled={busy}
                    onClick={() => {
                      key.current = null;
                      setConfirmation({ call, action: 'cancel' });
                    }}
                  >
                    Cancelar call
                  </Button>
                </>
              )}
            </div>
          </article>
        ))}
      </div>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar call' : 'Nova call'}</DialogTitle>
            <DialogDescription>
              Horário de São Paulo. Os participantes serão mencionados no canal de calls do Discord.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
          <form onSubmit={save} className="space-y-4">
            <label className="block space-y-1 text-sm">
              <span>Título</span>
              <input
                name="title"
                className={field}
                required
                minLength={3}
                maxLength={200}
                defaultValue={editing?.title}
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-sm">
                <span>Data e horário · São Paulo</span>
                <input
                  name="startsAt"
                  type="datetime-local"
                  className={field}
                  required
                  defaultValue={editing ? callInputDate(editing.startsAt) : ''}
                />
              </label>
              <label className="space-y-1 text-sm">
                <span>Duração em minutos</span>
                <input
                  name="durationMinutes"
                  type="number"
                  min={15}
                  max={480}
                  className={field}
                  required
                  defaultValue={editing?.durationMinutes ?? 60}
                />
              </label>
            </div>
            <label className="block space-y-1 text-sm">
              <span>Link HTTPS da reunião</span>
              <input
                name="meetingUrl"
                type="url"
                className={field}
                required
                placeholder="https://meet.google.com/…"
                defaultValue={editing?.meetingUrl}
              />
            </label>
            <fieldset className="rounded-lg border border-border p-3">
              <legend className="px-1 text-sm">Participantes</legend>
              <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
                {people.map((p) => (
                  <label
                    key={p.id}
                    className="flex min-h-11 items-center gap-3 rounded-md px-2 text-sm hover:bg-muted"
                  >
                    <input
                      type="checkbox"
                      name="participants"
                      value={p.id}
                      defaultChecked={editing?.participants.some((saved) => saved.id === p.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span>
                      {p.name}
                      {!p.userId && (
                        <span className="ml-1 text-xs text-muted-foreground">Somente Discord</span>
                      )}
                      {!p.discordId && (
                        <span className="ml-1 text-xs text-amber-500">Sem vínculo Discord</span>
                      )}
                    </span>
                  </label>
                ))}
              </div>
            </fieldset>
            <label className="block space-y-1 text-sm">
              <span>Lembretes em minutos antes da call</span>
              <input
                name="reminders"
                className={field}
                required
                defaultValue={(editing?.reminderMinutes ?? [30, 5, 0]).join(', ')}
              />
              <span className="block text-xs text-muted-foreground">
                Separe por vírgulas. Exemplo: 30, 5, 0. Zero significa no horário da call.
              </span>
            </label>
            <label className="block space-y-1 text-sm">
              <span>Descrição</span>
              <textarea
                name="description"
                className={field}
                maxLength={5000}
                rows={3}
                defaultValue={editing?.description}
              />
            </label>
            <label className="block space-y-1 text-sm">
              <span>Mensagem personalizada dos lembretes</span>
              <textarea
                name="message"
                className={field}
                maxLength={1000}
                rows={2}
                defaultValue={editing?.message}
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" disabled={busy} onClick={() => setOpen(false)}>
                Voltar
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? 'Salvando…' : 'Salvar agendamento'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirmation}
        onOpenChange={(value) => {
          if (!busy && !value) setConfirmation(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmation?.action === 'cancel'
                ? 'Cancelar esta call?'
                : 'Marcar esta call como realizada?'}
            </DialogTitle>
            <DialogDescription>
              {confirmation?.call.title}. Os lembretes pendentes serão invalidados. O histórico será
              preservado.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmation(null)}>
              Voltar
            </Button>
            <Button disabled={busy} onClick={() => void changeStatus()}>
              {busy ? 'Salvando…' : 'Confirmar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
