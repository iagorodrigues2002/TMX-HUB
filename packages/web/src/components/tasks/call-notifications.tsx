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
import { useAuth } from '@/lib/auth-context';
import { callDate, reminderLabel } from '@/lib/call-dashboard';
import { useQuery } from '@tanstack/react-query';
import { CalendarClock, ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';

const responseSchema = z.object({
  notifications: z.array(
    z.object({
      id: z.string(),
      callId: z.string(),
      title: z.string(),
      message: z.string(),
      startsAt: z.string().datetime({ offset: true }),
      meetingUrl: z
        .string()
        .url()
        .refine((url) => /^https:\/\//i.test(url)),
      minutes: z.number(),
      receivedAt: z.string().datetime({ offset: true }),
    }),
  ),
});

export function CallNotifications() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const query = useQuery({
    queryKey: ['call-notifications', user?.id],
    queryFn: async () => responseSchema.parse(await request('/v1/calls/notifications')),
    enabled: !!user,
    refetchInterval: 15000,
    retry: false,
  });
  const items = query.data?.notifications ?? [];
  async function read(id: string) {
    setBusy(id);
    setError('');
    try {
      await request(`/v1/calls/notifications/${encodeURIComponent(id)}/read`, { method: 'POST' });
      await query.refetch();
    } catch {
      setError('Não foi possível marcar o lembrete como lido. Tente novamente.');
    } finally {
      setBusy(null);
    }
  }
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={`Lembretes de calls: ${items.length}`}
        className="relative"
        onClick={() => setOpen(true)}
      >
        <CalendarClock className="h-4 w-4" aria-hidden />
        {items.length > 0 && (
          <span className="absolute -right-1 -top-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
            {items.length}
          </span>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Lembretes de calls</DialogTitle>
            <DialogDescription>
              Apenas reuniões às quais sua conta TMX está vinculada. Horários de São Paulo.
            </DialogDescription>
          </DialogHeader>
          {(query.error || error) && (
            <p role="alert" className="text-sm text-red-500">
              {error ||
                'Não foi possível consultar seus lembretes. Atualize para tentar novamente.'}
            </p>
          )}
          {query.isLoading && <output>Consultando lembretes…</output>}
          {!query.isLoading && !query.error && items.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Nenhum lembrete de call pendente.
            </p>
          )}
          <div className="space-y-3">
            {items.map((item) => (
              <article key={item.id} className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-primary">{reminderLabel(item.minutes)}</p>
                <h2 className="mt-1 font-semibold">{item.title}</h2>
                <p className="mt-2 text-sm">{callDate(item.startsAt)}</p>
                {item.message && (
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                    {item.message}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <a href={item.meetingUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink aria-hidden />
                      Entrar na call
                    </a>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!!busy}
                    onClick={() => void read(item.id)}
                  >
                    {busy === item.id ? 'Salvando…' : 'Marcar como lido'}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
