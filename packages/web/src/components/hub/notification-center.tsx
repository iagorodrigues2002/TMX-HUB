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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  type CenterNotification,
  centerSaleAmount,
  notificationApi,
} from '@/lib/api-client/endpoints-notifications';
import { useAuth } from '@/lib/auth-context';
import { callDate, reminderLabel } from '@/lib/call-dashboard';
import { saleClickDetail } from '@/lib/notification-center';
import { animateNotificationExit } from '@/lib/notification-center-motion';
import { usePrivacy } from '@/lib/privacy-context';
import { taskDate, taskStatusLabel } from '@/lib/task-dashboard';
import type { TaskStatus } from '@page-cloner/shared';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarClock,
  CheckCheck,
  CircleCheck,
  ExternalLink,
  ListTodo,
  MessageSquareText,
  RefreshCw,
  ShoppingBag,
  Trash2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import styles from './notification-center-preview.module.css';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnreadCountChange: (count: number) => void;
}
type Filter = 'all' | CenterNotification['kind'];

export function NotificationCenter({ open, onOpenChange, onUnreadCountChange }: Props) {
  const { user } = useAuth();
  const { isPrivate } = usePrivacy();
  const [filter, setFilter] = useState<Filter>('all');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const cards = useRef(new Map<string, HTMLLIElement>());
  const actionKeys = useRef(new Map<string, string>());
  const pending = useRef(false);
  const query = useQuery({
    queryKey: ['notification-center', user?.id],
    queryFn: notificationApi.list,
    enabled: !!user,
    refetchInterval: 15000,
    retry: false,
  });
  const notifications = query.data?.notifications ?? [];
  const unread = notifications.filter((n) => n.unread).length;
  const visible = notifications.filter((n) => filter === 'all' || n.kind === filter);
  useEffect(() => onUnreadCountChange(unread), [onUnreadCountChange, unread]);

  async function mutate(action: () => Promise<unknown>, exits: string[] = [], success = '') {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      await animateNotificationExit(
        exits.flatMap((id) => cards.current.get(id) ?? []),
        window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      );
      await query.refetch();
      if (success) setNotice(success);
    } catch {
      setError(
        'Não foi possível confirmar a alteração. Atualize a central antes de tentar novamente.',
      );
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function status(item: Extract<CenterNotification, { kind: 'task' }>, next: TaskStatus) {
    const action = `${item.task.id}:${next}`;
    const key = actionKeys.current.get(action) ?? crypto.randomUUID();
    actionKeys.current.set(action, key);
    return mutate(
      async () => {
        await notificationApi.status(item.task.id, next, key);
        actionKeys.current.delete(action);
      },
      [],
      'Alteração solicitada. O status e a saída da tarefa aguardam a confirmação do ClickUp e do Discord.',
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        overlayClassName="bg-background/40 backdrop-blur-[2px]"
        className={`${styles.drawer} tmx-sidebar-dialog left-auto right-0 top-0 h-dvh max-h-none w-full max-w-none gap-0 overflow-hidden rounded-none border-y-0 border-r-0 bg-popover p-0 sm:w-[460px] sm:max-h-none sm:p-0`}
      >
        <DialogHeader className="border-b border-border/70 px-5 py-5 pr-16 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <MessageSquareText className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <DialogTitle>Central de notificações</DialogTitle>
              <DialogDescription className="mt-1">
                Suas tarefas, vendas e calls. Atualização automática.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="border-b border-border/60 bg-muted/20 px-5 py-3 sm:px-6">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as Filter)}>
            <TabsList className="grid grid-cols-4">
              {(
                [
                  ['all', 'Todas'],
                  ['task', 'Tarefas'],
                  ['sale', 'Vendas'],
                  ['call', 'Calls'],
                ] as const
              ).map(([value, label]) => (
                <TabsTrigger key={value} value={value}>
                  {label}
                  <span className="ml-1 text-[10px] opacity-70">
                    {value === 'all'
                      ? notifications.length
                      : notifications.filter((item) => item.kind === value).length}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </div>
        <div className="flex min-h-14 items-center justify-between gap-2 border-b border-border/60 px-5 py-3 sm:px-6">
          <p className="text-xs text-muted-foreground">
            {unread ? `${unread} não lidas` : 'Tudo em dia'}
          </p>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              disabled={query.isFetching}
              aria-label="Atualizar notificações"
              onClick={() => void query.refetch()}
            >
              <RefreshCw aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={busy || !unread}
              onClick={() =>
                void mutate(
                  () =>
                    notificationApi.read(notifications.filter((n) => n.unread).map((n) => n.id)),
                  notifications.filter((n) => n.kind !== 'task' && n.unread).map((n) => n.id),
                )
              }
            >
              <CheckCheck aria-hidden />
              Marcar exibidas
            </Button>
          </div>
        </div>
        {(error || query.error) && (
          <p role="alert" className="border-b border-border px-5 py-3 text-xs text-red-500">
            {error ||
              'Não foi possível consultar as notificações. Use Atualizar para tentar novamente.'}
          </p>
        )}
        {notice && (
          <output className="border-b border-border px-5 py-3 text-xs text-primary">
            {notice}
          </output>
        )}
        <div className="min-h-0 flex-1 overflow-y-scroll px-5 py-5 [scrollbar-gutter:stable] sm:px-6">
          {query.isLoading && <output>Consultando notificações…</output>}
          {filter === 'sale' && notifications.some((n) => n.kind === 'sale') && (
            <Button
              variant="ghost"
              size="sm"
              className="mb-3"
              disabled={busy}
              onClick={() =>
                void mutate(
                  notificationApi.clearSales,
                  notifications.filter((n) => n.kind === 'sale').map((n) => n.id),
                  'Vendas ocultadas somente para sua conta. Os pedidos e o faturamento não foram alterados.',
                )
              }
            >
              <Trash2 aria-hidden />
              Limpar notificações de vendas
            </Button>
          )}
          {!query.isLoading && !query.error && !visible.length && (
            <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border/70 bg-muted/10 px-6 text-center">
              <div>
                <ListTodo className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden />
                <p className="mt-3 text-sm font-medium">Nenhuma notificação por aqui</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Tarefas em aberto permanecem até a conclusão.
                </p>
              </div>
            </div>
          )}
          <ol className="relative space-y-3 border-l border-border/80 pl-5">
            {visible.map((item, index) => (
              <li
                key={item.id}
                ref={(element) => {
                  if (element) cards.current.set(item.id, element);
                  else cards.current.delete(item.id);
                }}
                className={`relative ${styles.card}`}
                style={{ animationDelay: `${Math.min(index, 3) * 35}ms` }}
              >
                <span
                  className={`absolute -left-[25px] top-5 h-2 w-2 rounded-full ring-4 ring-popover ${item.unread ? (item.kind === 'sale' ? 'bg-emerald-400' : 'bg-primary') : 'bg-muted-foreground/40'}`}
                  aria-hidden
                />
                <article
                  className={`rounded-xl border p-4 ${item.unread ? (item.kind === 'sale' ? 'border-emerald-400/30 bg-emerald-400/[0.055]' : 'border-primary/25 bg-primary/[0.045]') : 'border-border/60 bg-muted/15'}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2">
                      {item.kind === 'sale' ? (
                        <ShoppingBag className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden />
                      ) : item.kind === 'call' ? (
                        <CalendarClock className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      ) : (
                        <ListTodo className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                      )}
                      <h3 className="break-words text-sm font-semibold">{item.title}</h3>
                    </div>
                    <time
                      className="shrink-0 text-[10px] text-muted-foreground"
                      dateTime={item.createdAt}
                    >
                      {taskDate(item.createdAt)}
                    </time>
                  </div>
                  {item.kind === 'task' && (
                    <>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant={item.task.status === 'pending' ? 'warning' : 'default'}>
                          {taskStatusLabel[item.task.status]}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Prazo: {taskDate(item.task.dueAt)}
                        </span>
                      </div>
                      <p className="mt-3 text-xs">
                        <span className="text-muted-foreground">Responsáveis: </span>
                        {item.task.assignees.map((p) => p.name).join(' · ')}
                      </p>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {item.task.sector} · {item.task.source}
                        {item.task.offer ? ` · ${item.task.offer}` : ''}
                      </p>
                      <fieldset
                        className="mt-3 flex flex-wrap gap-2"
                        aria-label={`Status de ${item.title}`}
                      >
                        {(['pending', 'progress', 'done'] as const).map((next) => (
                          <Button
                            key={next}
                            variant="outline"
                            size="sm"
                            disabled={
                              busy || item.task.status === next || item.task.syncState !== 'synced'
                            }
                            aria-pressed={item.task.status === next}
                            onClick={() => void status(item, next)}
                          >
                            {taskStatusLabel[next]}
                          </Button>
                        ))}
                      </fieldset>
                      {item.task.clickupId && (
                        <Button asChild variant="ghost" size="sm" className="mt-3">
                          <a
                            href={`https://app.clickup.com/t/${encodeURIComponent(item.task.clickupId)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            Abrir tarefa
                            <ExternalLink aria-hidden />
                          </a>
                        </Button>
                      )}
                    </>
                  )}
                  {item.kind === 'sale' && (
                    <>
                      <p className="mt-3 text-xl font-semibold">
                        {isPrivate
                          ? '****'
                          : centerSaleAmount(item.sale.amountMinor, item.sale.currency)}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant={item.sale.orderKind === 'upsell' ? 'warning' : 'success'}>
                          {item.sale.orderKind === 'upsell' ? 'Upsell' : 'Venda principal'}
                        </Badge>
                        <Badge variant="outline">{item.sale.provider}</Badge>
                      </div>
                      <dl className="mt-3 space-y-2 text-xs">
                        <div>
                          <dt className="text-muted-foreground">Oferta</dt>
                          <dd>{item.sale.offerName}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">
                            {saleClickDetail(item.sale.lastClick).label}
                          </dt>
                          <dd>{saleClickDetail(item.sale.lastClick).value}</dd>
                        </div>
                      </dl>
                    </>
                  )}
                  {item.kind === 'call' && (
                    <>
                      <p className="mt-3 text-xs text-primary">
                        {reminderLabel(item.call.minutes)}
                      </p>
                      <p className="mt-2 text-sm">{callDate(item.call.startsAt)} · São Paulo</p>
                      {item.call.message && (
                        <p className="mt-3 whitespace-pre-wrap break-words text-xs text-muted-foreground">
                          {item.call.message}
                        </p>
                      )}
                      <Button asChild variant="outline" size="sm" className="mt-3">
                        <a href={item.call.meetingUrl} target="_blank" rel="noopener noreferrer">
                          Entrar na call
                          <ExternalLink aria-hidden />
                        </a>
                      </Button>
                    </>
                  )}
                  <div className="mt-4 border-t border-border/50 pt-3">
                    {item.unread ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void mutate(
                            () => notificationApi.read([item.id]),
                            item.kind === 'task' ? [] : [item.id],
                          )
                        }
                      >
                        <CircleCheck aria-hidden />
                        Marcar como lida
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Lida · permanece até a conclusão
                      </span>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </div>
        <footer className="border-t border-border/60 bg-muted/20 px-5 py-3 text-center text-[11px] text-muted-foreground">
          Leitura individual. Conclusões de tarefas aguardam confirmação externa.
        </footer>
      </DialogContent>
    </Dialog>
  );
}
