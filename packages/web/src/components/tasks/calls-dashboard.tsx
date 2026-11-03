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
import { callInputDate, callStartIso, parseCallReminders } from '@/lib/call-dashboard';
import { CallCreateSchema, type ManagedCall } from '@page-cloner/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CalendarDays, Plus, RefreshCw, ShieldCheck } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { CallCard } from './call-card';
import styles from './task-dashboard.module.css';

const field =
  'min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary';

export function CallsDashboard({
  companyId,
  companyAccess = false,
}: { companyId?: string; companyAccess?: boolean }) {
  const { user, loading } = useAuth();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const queryClient = useQueryClient();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);
  const allowed = companyAccess || user?.role === 'admin';
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
    queryKey: ['managed-calls', user?.id, companyId, filter],
    queryFn: () => callApi.list(filter, companyId),
    enabled: allowed,
    refetchInterval: 15000,
    retry: false,
  });
  const peopleQuery = useQuery({
    queryKey: ['task-people', user?.id, companyId],
    queryFn: () => taskApi.people(companyId),
    enabled: allowed,
    retry: false,
  });
  const calls = callsQuery.data?.calls ?? [];
  const native = callsQuery.data?.managementMode === 'native';
  const people = peopleQuery.data ?? [];
  async function refreshCalls() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['managed-calls'] }),
      queryClient.invalidateQueries({ queryKey: ['call-notifications', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['notification-center', user?.id] }),
    ]);
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;
    setError('');
    const form = new FormData(event.currentTarget);
    try {
      const parsed = CallCreateSchema.safeParse({
        companyId: editing ? editing.companyId : companyId,
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
        native
          ? 'Agendamento salvo no TMX. Os lembretes privados não dependem do ClickUp.'
          : 'Agendamento salvo. A sincronização só será confirmada após o retorno do ClickUp e do Discord.',
      );
      await refreshCalls();
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
      const updated = await callApi.status(
        confirmation.call.id,
        confirmation.call.revision,
        confirmation.action,
        key.current,
      );
      key.current = null;
      setConfirmation(null);
      setNotice(
        `${updated.status === 'completed' ? 'Call concluída' : 'Call cancelada'} no TMX. Histórico preservado e lembretes pendentes encerrados. ${updated.managementMode === 'native' ? 'A atualização no Discord será confirmada separadamente.' : 'A sincronização da integração antiga está pendente.'}`,
      );
      await refreshCalls();
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
        <h1 className="mt-3 text-xl font-semibold">Acesso às calls não autorizado</h1>
        <p>Nenhum agendamento foi solicitado.</p>
      </div>
    );

  return (
    <section className={`${styles.dashboard} space-y-5`} aria-label="Gestão de calls">
      <header className={styles.pageHeader} data-motion-panel>
        <div>
          <p className="mb-2 flex items-center gap-2 text-[10px] font-medium uppercase tracking-[.18em] text-primary">
            <CalendarDays className="h-4 w-4" aria-hidden /> Agenda da equipe
          </p>
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Agenda de calls
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {native
              ? 'Agendamentos e lembretes gerenciados no TMX, com avisos no Calendário de Calls do Discord.'
              : 'Agende no TMX. Acompanhe os registros no ClickUp e os avisos no Calendário de Calls do Discord.'}
          </p>
        </div>
        <div className={styles.headerActions}>
          <Button
            variant="outline"
            aria-label="Atualizar calls"
            disabled={callsQuery.isFetching}
            onClick={() => void callsQuery.refetch()}
          >
            <RefreshCw aria-hidden />
          </Button>
          <Button
            disabled={!callsQuery.data || !people.length || !companyId}
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
      {!companyId && (
        <p className="text-sm text-muted-foreground">
          Selecione uma empresa para agendar uma nova call. Agendamentos legados mantêm a integração
          original.
        </p>
      )}
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
      <div
        className={`${styles.surface} flex flex-wrap items-center justify-between gap-3 p-3`}
        data-motion-panel
      >
        <label className="flex items-center gap-3 text-sm">
          Mostrar
          <select className={field} value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="scheduled">Agendadas</option>
            <option value="completed">Concluídas</option>
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
      <div className="space-y-3" data-motion-panel>
        {calls.map((call) => (
          <article key={call.id} className={`${styles.surface} ${styles.call} p-4 sm:p-5`}>
            <CallCard
              call={call}
              now={now}
              busy={busy}
              onEdit={(selected) => {
                setEditing(selected);
                key.current = null;
                setError('');
                setOpen(true);
              }}
              onStatus={(selected, action) => {
                key.current = null;
                setError('');
                setConfirmation({ call: selected, action });
              }}
            />
          </article>
        ))}
      </div>
      <Dialog
        open={open}
        onOpenChange={(value) => {
          if (!busy) setOpen(value);
        }}
      >
        <DialogContent
          className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            headingRef.current?.focus();
          }}
        >
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
                      disabled={native && !p.userId}
                      defaultChecked={editing?.participants.some((saved) => saved.id === p.id)}
                      className="h-4 w-4 accent-primary"
                    />
                    <span>
                      {p.name}
                      {!p.userId && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          {native ? 'Sem conta TMX' : 'Somente Discord'}
                        </span>
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
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            headingRef.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {confirmation?.action === 'cancel'
                ? 'Cancelar esta call?'
                : 'Marcar esta call como concluída?'}
            </DialogTitle>
            <DialogDescription>
              {confirmation?.call.title}. Os lembretes pendentes serão invalidados. O histórico será
              preservado.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-red-500">
              {error}
            </p>
          )}
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
