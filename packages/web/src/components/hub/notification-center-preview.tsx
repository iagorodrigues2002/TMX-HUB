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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { usePrivacy } from '@/lib/privacy-context';
import { type ApprovedSaleClick, isActiveNotification, saleClickDetail } from '@/lib/notification-center';
import { animateNotificationExit } from '@/lib/notification-center-motion';
import styles from './notification-center-preview.module.css';
import {
  Banknote,
  CheckCheck,
  CircleCheck,
  Clock3,
  ExternalLink,
  ListTodo,
  MessageSquareText,
  MoreHorizontal,
  ShoppingBag,
  Trash2,
  Undo2,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface NotificationCenterPreviewProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUnreadCountChange: (count: number) => void;
}

type NotificationFilter = 'all' | 'task' | 'sale';

interface TaskNotification {
  id: string;
  kind: 'task';
  order: number;
  title: string;
  event: string;
  status: string;
  statusVariant: 'default' | 'success' | 'warning';
  assignees: string[];
  dueDate: string;
  time: string;
  source: string;
  href: string;
  unread: boolean;
}

interface SaleNotification {
  id: string;
  kind: 'sale';
  order: number;
  amount: string;
  approvedClick: ApprovedSaleClick | null;
  product: string;
  offer: string;
  platform: string;
  saleType: 'Venda principal' | 'Upsell';
  time: string;
  unread: boolean;
}

type PreviewNotification = TaskNotification | SaleNotification;

const previewNotifications: PreviewNotification[] = [
  {
    id: 'sale-vendepay-88312',
    kind: 'sale',
    order: 6,
    amount: 'R$ 497,00',
    approvedClick: null,
    product: 'TMX Performance',
    offer: 'Front Brasil',
    platform: 'VendePay',
    saleType: 'Venda principal',
    time: 'agora',
    unread: true,
  },
  {
    id: 'discord-1433189831368937482',
    kind: 'task',
    order: 5,
    title: 'Criar novo perfil de Spy',
    event: 'Nova tarefa atribuída a você',
    status: 'Pendente',
    statusVariant: 'warning',
    assignees: ['Dods', 'Lucas Gomes'],
    dueDate: 'Hoje, 29/10 às 23:59',
    time: 'há 4 min',
    source: '#solicitar-tarefas',
    href: 'https://app.clickup.com/t/86e3x0y4b',
    unread: true,
  },
  {
    id: 'sale-syzepay-88311',
    kind: 'sale',
    order: 4,
    amount: 'R$ 97,00',
    approvedClick: { operatorId: 'demo-douglas', operatorName: 'Douglas Riti' },
    product: 'Order Bump — Criativos',
    offer: 'Front Brasil',
    platform: 'SyzePay',
    saleType: 'Upsell',
    time: 'há 12 min',
    unread: true,
  },
  {
    id: 'discord-1433168006519251004',
    kind: 'task',
    order: 3,
    title: 'Revisar copies da PJR',
    event: 'Iago atualizou o prazo',
    status: 'Em progresso',
    statusVariant: 'default',
    assignees: ['Iago Rodrigues'],
    dueDate: '30/10 às 18:00',
    time: 'há 38 min',
    source: '#solicitar-tarefas',
    href: 'https://app.clickup.com/',
    unread: true,
  },
  {
    id: 'sale-vendepay-88310',
    kind: 'sale',
    order: 2,
    amount: 'R$ 297,00',
    approvedClick: null,
    product: 'TMX Tracking',
    offer: 'Escala Internacional',
    platform: 'VendePay',
    saleType: 'Venda principal',
    time: 'há 1 h',
    unread: false,
  },
  {
    id: 'discord-1432950610254528583',
    kind: 'task',
    order: 1,
    title: 'Configurar evento de checkout',
    event: 'Tarefa marcada como concluída',
    status: 'Concluído',
    statusVariant: 'success',
    assignees: ['Lucas Gomes'],
    dueDate: 'Concluída ontem às 17:42',
    time: 'ontem',
    source: '#solicitar-tarefas',
    href: 'https://app.clickup.com/',
    unread: false,
  },
];

export function NotificationCenterPreview({
  open,
  onOpenChange,
  onUnreadCountChange,
}: NotificationCenterPreviewProps) {
  const { isPrivate } = usePrivacy();
  const [notifications, setNotifications] = useState(previewNotifications);
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [lastClearedSales, setLastClearedSales] = useState<SaleNotification[]>([]);
  const cards = useRef(new Map<string, HTMLLIElement>());
  const positions = useRef(new Map<string, number>());
  const active = notifications.filter(isActiveNotification);
  const unreadCount = active.filter(({ unread }) => unread).length;
  const taskCount = active.filter(({ kind }) => kind === 'task').length;
  const saleCount = active.filter(({ kind }) => kind === 'sale').length;
  const visible = active.filter(({ kind }) => filter === 'all' || kind === filter);

  useLayoutEffect(() => {
    const next = new Map([...cards.current].map(([id, element]) => [id, element.getBoundingClientRect().top]));
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (const [id, top] of next) {
        const previous = positions.current.get(id);
        if (previous !== undefined && previous !== top) {
          cards.current.get(id)?.animate?.(
            [{ transform: `translateY(${previous - top}px)` }, { transform: 'translateY(0)' }],
            { duration: 220, easing: 'cubic-bezier(.16,1,.3,1)' },
          );
        }
      }
    }
    positions.current = next;
  });

  const exitCards = (ids: string[]) => animateNotificationExit(
    ids.flatMap((id) => cards.current.get(id) ?? []),
    window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => onUnreadCountChange(unreadCount), [onUnreadCountChange, unreadCount]);

  const markAsRead = async (id: string) => {
    if (notifications.some((item) => item.id === id && item.kind === 'sale')) await exitCards([id]);
    setNotifications((current) =>
      current.map((notification) =>
        notification.id === id ? { ...notification, unread: false } : notification,
      ),
    );
  };

  const clearSales = async (onlyRead: boolean) => {
    const removed = notifications.filter(
      (notification): notification is SaleNotification =>
        notification.kind === 'sale' && (!onlyRead || !notification.unread),
    );
    if (!removed.length) return;
    await exitCards(removed.map(({ id }) => id));
    setNotifications((current) =>
      current.filter(({ id }) => !removed.some((sale) => sale.id === id)),
    );
    setLastClearedSales(removed);
  };

  const undoClearSales = () => {
    setNotifications((current) =>
      [...current, ...lastClearedSales].sort((a, b) => b.order - a.order),
    );
    setLastClearedSales([]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent overlayClassName="bg-background/40 backdrop-blur-[2px]" className={`${styles.drawer} tmx-sidebar-dialog left-auto right-0 top-0 h-dvh max-h-none w-full max-w-none gap-0 overflow-hidden rounded-none border-y-0 border-r-0 bg-popover p-0 sm:w-[460px] sm:max-h-none sm:p-0`}>
        <DialogHeader className="border-b border-border/70 px-5 py-5 pr-16 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-lg border border-primary/20 bg-primary/10 text-primary">
              <MessageSquareText className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <DialogTitle>Central de notificações</DialogTitle>
              <DialogDescription className="mt-1">
                Demonstração local · dados fictícios, sem sincronização.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="border-b border-border/60 bg-muted/20 px-5 py-3 sm:px-6">
          <Tabs value={filter} onValueChange={(value) => setFilter(value as NotificationFilter)}>
            <TabsList className="grid grid-cols-3">
              <TabsTrigger value="all">
                Todas <span className="ml-1.5 text-[10px] opacity-70">{active.length}</span>
              </TabsTrigger>
              <TabsTrigger value="task">
                Tarefas <span className="ml-1.5 text-[10px] opacity-70">{taskCount}</span>
              </TabsTrigger>
              <TabsTrigger value="sale">
                Vendas <span className="ml-1.5 text-[10px] opacity-70">{saleCount}</span>
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="flex items-center justify-between border-b border-border/60 px-5 py-3 sm:px-6">
          <p className="text-xs font-medium text-muted-foreground">
            {unreadCount ? `${unreadCount} não lidas` : 'Tudo em dia'}
          </p>
          <div className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!unreadCount}
              onClick={async () => {
                await exitCards(active.filter(({ kind }) => kind === 'sale').map(({ id }) => id));
                setNotifications((current) => current.map((item) => ({ ...item, unread: false })));
              }}
            >
              <CheckCheck aria-hidden /> Marcar lidas
            </Button>
            {(filter === 'all' || filter === 'sale') && saleCount > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="ghost" size="icon" aria-label="Opções de limpeza">
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem className="text-danger" onSelect={() => clearSales(false)}>
                    <Trash2 aria-hidden /> Limpar todas as vendas
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-scroll px-5 py-5 [scrollbar-gutter:stable] sm:px-6">
          <div className="mb-4 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Linha do tempo demonstrativa
            </p>
            {filter === 'sale' && saleCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[11px] text-emerald-400">
                <Banknote className="h-3.5 w-3.5" aria-hidden /> Dados de exemplo
              </span>
            )}
          </div>

          {!visible.length ? (
            <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border/70 bg-muted/10 px-6 text-center">
              <div>
                <ListTodo className="mx-auto h-8 w-8 text-muted-foreground/50" aria-hidden />
                <p className="mt-3 text-sm font-medium">Nenhuma notificação por aqui</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Novas atualizações aparecerão automaticamente.
                </p>
              </div>
            </div>
          ) : (
            <ol className="relative space-y-3 border-l border-border/80 pl-5">
              {visible.map((notification, index) => (
                <li
                  key={notification.id}
                  ref={(element) => { if (element) cards.current.set(notification.id, element); else cards.current.delete(notification.id); }}
                  className={`relative ${styles.card}`}
                  style={{ animationDelay: `${Math.min(index, 3) * 35}ms` }}
                >
                  <span
                    className={`absolute -left-[25px] top-5 h-2 w-2 rounded-full ring-4 ring-popover transition-all duration-200 motion-reduce:transition-none ${notification.unread ? (notification.kind === 'sale' ? 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.65)]' : 'bg-primary') : 'bg-muted-foreground/40'}`}
                    aria-hidden
                  />
                  {notification.kind === 'task' ? (
                    <article
                      className={`rounded-xl border p-4 transition-colors duration-200 motion-reduce:transition-none ${notification.unread ? 'border-primary/25 bg-primary/[0.045]' : 'border-border/60 bg-muted/15'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-medium text-primary">
                            {notification.event}
                          </p>
                          <h3 className="mt-1 text-sm font-semibold leading-snug text-foreground">
                            {notification.title}
                          </h3>
                        </div>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {notification.time}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-2">
                        <Badge variant={notification.statusVariant}>{notification.status}</Badge>
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock3 className="h-3.5 w-3.5" aria-hidden /> {notification.dueDate}
                        </span>
                      </div>
                      <dl className="mt-3 grid gap-1 text-xs">
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground">Responsáveis</dt>
                          <dd className="font-medium text-foreground">
                            {notification.assignees.join(' e ')}
                          </dd>
                        </div>
                        <div className="flex gap-2">
                          <dt className="text-muted-foreground">Origem</dt>
                          <dd className="font-medium text-foreground">{notification.source}</dd>
                        </div>
                      </dl>
                      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label={`Status de ${notification.title} — simulação local`}>
                        {(['Pendente', 'Em progresso', 'Concluído'] as const).map((status) => (
                          <Button
                            key={status}
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-pressed={notification.status === status}
                            onClick={async () => {
                              if (status === 'Concluído') await exitCards([notification.id]);
                              setNotifications((current) => current.map((item) =>
                              item.id === notification.id && item.kind === 'task'
                                ? { ...item, status, statusVariant: status === 'Concluído' ? 'success' : status === 'Pendente' ? 'warning' : 'default' }
                                : item,
                              ));
                            }}
                          >
                            {status}
                          </Button>
                        ))}
                      </div>
                      <p className="mt-2 text-[10px] text-muted-foreground">Simulação local · não altera o ClickUp nem o Discord.</p>
                      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border/50 pt-3">
                        <ReadAction
                          unread={notification.unread}
                          onRead={() => markAsRead(notification.id)}
                        />
                        <Button asChild variant="outline" size="sm">
                          <a href={notification.href} target="_blank" rel="noreferrer">
                            Abrir tarefa <ExternalLink aria-hidden />
                          </a>
                        </Button>
                      </div>
                    </article>
                  ) : (
                    <article
                      className={`rounded-xl border p-4 transition-colors duration-200 motion-reduce:transition-none ${notification.unread ? 'border-emerald-400/30 bg-emerald-400/[0.055]' : 'border-border/60 bg-muted/15'}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-emerald-400/20 bg-emerald-400/10 text-emerald-400">
                            <ShoppingBag className="h-4 w-4" aria-hidden />
                          </span>
                          <div>
                            <p className="text-[11px] font-medium text-emerald-400">
                              Nova venda aprovada
                            </p>
                            <p className="mt-0.5 text-lg font-semibold tracking-tight text-foreground">
                              {isPrivate ? '****' : notification.amount}
                            </p>
                          </div>
                        </div>
                        <span className="shrink-0 text-[11px] text-muted-foreground">
                          {notification.time}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Badge variant={notification.saleType === 'Upsell' ? 'warning' : 'success'}>
                          {notification.saleType}
                        </Badge>
                        <Badge variant="outline">{notification.platform}</Badge>
                      </div>
                      <dl className="mt-3 grid gap-1.5 text-xs">
                        <SaleDetail label="Produto" value={notification.product} />
                        <SaleDetail label="Oferta" value={notification.offer} />
                        <SaleDetail {...saleClickDetail(notification.approvedClick)} />
                      </dl>
                      <div className="mt-4 border-t border-border/50 pt-3">
                        <ReadAction
                          unread={notification.unread}
                          onRead={() => markAsRead(notification.id)}
                        />
                      </div>
                    </article>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>

        {lastClearedSales.length > 0 && (
          <div className="mx-5 mb-3 flex items-center justify-between rounded-lg border border-border bg-popover px-3 py-2 shadow-lg motion-safe:animate-in motion-safe:slide-in-from-bottom-2 sm:mx-6">
            <p className="text-xs text-muted-foreground">
              {lastClearedSales.length}{' '}
              {lastClearedSales.length === 1 ? 'venda removida' : 'vendas removidas'}
            </p>
            <Button type="button" variant="ghost" size="sm" onClick={undoClearSales}>
              <Undo2 aria-hidden /> Desfazer
            </Button>
          </div>
        )}
        <footer className="border-t border-border/60 bg-muted/20 px-5 py-3 text-center text-[11px] text-muted-foreground sm:px-6">
          Preview visual · nenhuma venda ou tarefa real foi alterada
        </footer>
      </DialogContent>
    </Dialog>
  );
}

function ReadAction({ unread, onRead }: { unread: boolean; onRead: () => void }) {
  return unread ? (
    <Button type="button" variant="ghost" size="sm" onClick={onRead}>
      <CircleCheck aria-hidden /> Marcar como lida
    </Button>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
      <CircleCheck className="h-4 w-4" aria-hidden /> Lida
    </span>
  );
}

function SaleDetail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate font-medium text-foreground">{value}</dd>
    </div>
  );
}
