'use client';

import { Button } from '@/components/ui/button';
import { callDate, callScheduleState, reminderLabel } from '@/lib/call-dashboard';
import type { ManagedCall } from '@page-cloner/shared';
import { CheckCheck, Clock3, ExternalLink, Users } from 'lucide-react';

const labels = {
  upcoming: 'Agendada',
  ongoing: 'No horário da call',
  elapsed: 'Aguardando conclusão',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

export function CallCard({
  call,
  now,
  busy,
  onEdit,
  onStatus,
}: {
  call: ManagedCall;
  now: number;
  busy: boolean;
  onEdit: (call: ManagedCall) => void;
  onStatus: (call: ManagedCall, action: 'cancel' | 'complete') => void;
}) {
  const state = callScheduleState(call, now);
  const deliveryLabel =
    call.managementMode === 'native'
      ? call.discordState === 'synced'
        ? 'Salva no TMX · Discord confirmado'
        : call.discordState === 'failed'
          ? 'Salva no TMX · Discord requer conferência'
          : 'Salva no TMX · Discord pendente'
      : call.syncState === 'synced'
        ? 'ClickUp e Discord confirmados'
        : call.syncState === 'failed'
          ? 'Falha na integração antiga'
          : 'Salva no TMX · Integração antiga pendente';
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="break-words text-lg font-semibold">{call.title}</h2>
        <span
          className={`rounded-full border px-2 py-1 text-xs ${state === 'elapsed' ? 'border-warning/30 bg-warning/10 text-warning dark:text-warning' : call.status === 'cancelled' ? 'text-muted-foreground' : call.status === 'completed' ? 'text-success dark:text-success' : 'text-primary'}`}
        >
          {labels[state]}
        </span>
      </div>
      <p className="mt-2 font-medium tabular-nums">
        {callDate(call.startsAt)} · {call.durationMinutes} minutos
      </p>
      {state === 'elapsed' && (
        <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm">
          <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          Horário encerrado. Confirme se a call aconteceu, reagende ou cancele. O horário sozinho
          não confirma a realização.
        </p>
      )}
      <p className="mt-3 flex items-start gap-2 text-sm">
        <Users className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        {call.participants.map((p) => p.name).join(' · ')}
      </p>
      <fieldset className="mt-4 flex min-w-0 flex-wrap gap-2">
        <legend className="sr-only">Ações de {call.title}</legend>
        {call.status === 'scheduled' && (
          <>
            <Button disabled={busy} onClick={() => onStatus(call, 'complete')}>
              <CheckCheck aria-hidden />
              Marcar como concluída
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => onEdit(call)}>
              Editar / reagendar
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => onStatus(call, 'cancel')}>
              Cancelar call
            </Button>
          </>
        )}
        <Button asChild variant="outline">
          <a href={call.meetingUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink aria-hidden />
            {state === 'upcoming' || state === 'ongoing' ? 'Entrar na call' : 'Abrir link da call'}
          </a>
        </Button>
      </fieldset>
      {(call.syncState !== 'synced' ||
        (call.managementMode === 'native' && call.discordState !== 'synced')) && (
        <p className="mt-3 text-xs text-muted-foreground">{deliveryLabel}</p>
      )}
      <details className="mt-4 border-t border-border pt-3">
        <summary className="cursor-pointer rounded-md text-sm text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          Detalhes e integração
        </summary>
        <p className="mt-3 text-xs text-muted-foreground">{deliveryLabel}</p>
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
        {call.clickupId && (
          <Button asChild variant="ghost" className="mt-3">
            <a
              href={`https://app.clickup.com/t/${encodeURIComponent(call.clickupId)}`}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir no ClickUp
            </a>
          </Button>
        )}
      </details>
    </>
  );
}
