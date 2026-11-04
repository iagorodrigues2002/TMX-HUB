'use client';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { animateNotificationExit } from '@/lib/notification-center-motion';
import {
  CalendarClock,
  CheckCheck,
  CircleCheck,
  Eye,
  EyeOff,
  ListTodo,
  MessageSquareText,
  RefreshCw,
  ShoppingBag,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { collapseNotificationSpace } from './reference-notification-motion';
import styles from './reference.module.css';

const items = [
  {
    id: 'sale-1',
    group: 'Vendas',
    title: 'Venda aprovada',
    value: 'MX$ 438,29',
    tag: 'Venda principal',
    offer: 'PJR_ESP',
    detail: 'Origem · Venda natural',
    date: '03/11/2026, 14:06',
    Icon: ShoppingBag,
  },
  {
    id: 'sale-2',
    group: 'Vendas',
    title: 'Venda aprovada',
    value: '£ 11,06',
    tag: 'Upsell',
    offer: 'PJR_ENG',
    detail: 'Último clique · Colaborador de exemplo',
    date: '03/11/2026, 13:28',
    Icon: ShoppingBag,
  },
  {
    id: 'sale-3',
    group: 'Vendas',
    title: 'Venda aprovada',
    value: 'US$ 23,41',
    tag: 'Venda principal',
    offer: 'PJR_ENG',
    detail: 'Origem · Venda natural',
    date: '03/11/2026, 13:28',
    Icon: ShoppingBag,
  },
  {
    id: 'task-1',
    group: 'Tarefas',
    title: 'Editar ads',
    value: '04/11/2026, 11:54',
    tag: 'Em progresso',
    offer: 'Infraestrutura · tmx · PJR_ENG e PJR_ESP',
    detail: 'Responsáveis · Iago Rodrigues (exemplo)',
    date: '03/11/2026, 11:54',
    Icon: ListTodo,
  },
  {
    id: 'task-2',
    group: 'Tarefas',
    title: 'Melhorias de funil',
    value: '15/11/2026, 22:00',
    tag: 'Pendente',
    offer: 'Spy · tmx · SLM_ENG',
    detail: 'Responsáveis · Lucas Gomes e Iago Rodrigues (exemplo)',
    date: '03/11/2026, 10:43',
    Icon: ListTodo,
  },
  {
    id: 'task-3',
    group: 'Tarefas',
    title: 'Testar upsells ocultos no PJR_ESP e PJR_ENG',
    value: '06/11/2026, 10:42',
    tag: 'Pendente',
    offer: 'Infraestrutura · tmx',
    detail: 'Responsáveis · Iago Rodrigues (exemplo)',
    date: '03/11/2026, 10:42',
    Icon: ListTodo,
  },
  {
    id: 'call-1',
    group: 'Calls',
    title: 'Reunião da operação',
    value: 'Hoje · 17:00',
    tag: 'Lembrete',
    offer: 'Equipe de exemplo',
    detail: 'Começa em breve · horário de São Paulo',
    date: '03/11/2026, 12:00',
    Icon: CalendarClock,
  },
];
const groups = ['Todas', 'Tarefas', 'Vendas', 'Calls', 'Financeiro'];

export function NotificationsSpecimen({
  theme,
  motion,
}: { theme: 'dark' | 'light'; motion: boolean }) {
  const [group, setGroup] = useState('Todas');
  const [displayedGroup, setDisplayedGroup] = useState('Todas');
  const [tabPhase, setTabPhase] = useState<'idle' | 'out' | 'in'>('idle');
  const tabTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [read, setRead] = useState<string[]>(['call-1', 'task-2', 'task-3']);
  const [taskStatuses, setTaskStatuses] = useState<Record<string, string>>({
    'task-1': 'Em progresso',
    'task-2': 'Pendente',
    'task-3': 'Pendente',
  });
  const [completed, setCompleted] = useState<string[]>([]);
  const [undo, setUndo] = useState<{ read: string[]; completed: string[] } | null>(null);
  const [privateMode, setPrivateMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('Amostra fictícia · sem acesso às notificações reais.');
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const cards = useRef(new Set<HTMLElement>());
  const exiting = useRef<HTMLElement[]>([]);
  const marking = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(timer.current);
      clearTimeout(tabTimer.current);
      for (const card of exiting.current)
        for (const animation of card.getAnimations?.() ?? []) animation.cancel();
    };
  }, []);
  const available = items.filter(
    (item) => !completed.includes(item.id) && (item.group !== 'Vendas' || !read.includes(item.id)),
  );
  const visible = available.filter(
    (item) => displayedGroup === 'Todas' || item.group === displayedGroup,
  );
  const unread = available.filter((item) => !read.includes(item.id)).length;
  const mark = async (ids: string[], completeTask = false) => {
    if (marking.current || busy || tabPhase !== 'idle') return;
    marking.current = true;
    setBusy(true);
    const pending = ids.filter((id) =>
      completeTask
        ? items.some((item) => item.id === id && item.group === 'Tarefas') &&
          !completed.includes(id)
        : !read.includes(id),
    );
    const dismissed = pending.filter(
      (id) => completeTask || items.some((item) => item.id === id && item.group === 'Vendas'),
    );
    exiting.current = [...cards.current].filter((card) =>
      dismissed.includes(card.dataset.notificationId ?? ''),
    );
    const focusFallback = exiting.current
      .find((card) => card.contains(document.activeElement))
      ?.closest('[data-notification-panel]')
      ?.querySelector<HTMLElement>('[role="tab"][data-state="active"]');
    if (
      exiting.current.length > 0 &&
      motion &&
      !window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      await animateNotificationExit(exiting.current, false);
      if (alive.current && !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
        await collapseNotificationSpace(exiting.current);
    }
    if (!alive.current) return;
    focusFallback?.focus({ preventScroll: true });
    setUndo({ read, completed });
    setRead([...new Set([...read, ...ids])]);
    if (completeTask) setCompleted([...new Set([...completed, ...pending])]);
    exiting.current = [];
    marking.current = false;
    setBusy(false);
    setMessage(
      completeTask
        ? 'Tarefa concluída somente nesta demonstração.'
        : `${pending.length} notificação(ões) marcada(s) como lida(s) somente no exemplo.`,
    );
  };
  const changeGroup = (next: string) => {
    if (busy) return;
    clearTimeout(tabTimer.current);
    setGroup(next);
    if (!motion || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayedGroup(next);
      setTabPhase('idle');
      return;
    }
    if (next === displayedGroup) {
      setTabPhase('idle');
      return;
    }
    setTabPhase('out');
    tabTimer.current = setTimeout(() => {
      setDisplayedGroup(next);
      setTabPhase('in');
      tabTimer.current = setTimeout(() => setTabPhase('idle'), 280);
    }, 140);
  };
  const panel = () => (
    <div className={styles.notificationFrame} data-notification-panel>
      <header className={styles.notificationHeader}>
        <MessageSquareText aria-hidden />
        <div>
          <h3>Central de notificações</h3>
          <p>Tarefas, vendas, calls e movimentações autorizadas.</p>
        </div>
        <Button
          variant="ghost"
          className={`${styles.secondary} ${styles.iconButton}`}
          aria-label={
            privateMode ? 'Revelar valores das notificações' : 'Ocultar valores das notificações'
          }
          aria-pressed={privateMode}
          onClick={() => setPrivateMode(!privateMode)}
        >
          {privateMode ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
        </Button>
      </header>
      <Tabs value={group} onValueChange={changeGroup}>
        <TabsList className={styles.notificationTabs}>
          {groups.map((value) => (
            <TabsTrigger key={value} value={value} className={styles.notificationTab}>
              {value}
              <span>
                {available.filter((item) => value === 'Todas' || item.group === value).length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>
      <div className={styles.notificationToolbar}>
        <span>{unread ? `${unread} não lidas` : 'Tudo em dia'}</span>
        <Button
          className={`${styles.secondary} ${styles.iconButton}`}
          variant="ghost"
          disabled={busy}
          aria-label="Atualizar notificações de exemplo"
          onClick={() => {
            setBusy(true);
            setMessage('Atualizando demonstração…');
            timer.current = setTimeout(() => {
              setBusy(false);
              setMessage('Exemplo atualizado. Nenhuma consulta real foi feita.');
            }, 700);
          }}
        >
          <RefreshCw className={busy ? styles.loginSpinner : undefined} aria-hidden />
        </Button>
        <Button
          className={styles.secondary}
          variant="ghost"
          disabled={busy || tabPhase !== 'idle' || !visible.some((item) => !read.includes(item.id))}
          onClick={() => mark(visible.map((item) => item.id))}
        >
          <CheckCheck aria-hidden />
          Marcar exibidas
        </Button>
      </div>
      <div className={styles.notificationList}>
        <div
          className={styles.notificationCategory}
          data-phase={tabPhase}
          inert={tabPhase === 'out' || undefined}
        >
          {visible.length === 0 && (
            <div className={styles.operationsNotice}>
              <strong>
                {displayedGroup === 'Financeiro'
                  ? 'Nenhuma notificação financeira neste exemplo'
                  : 'Nenhuma notificação pendente nesta categoria'}
              </strong>
              <p>
                Quando houver uma movimentação autorizada, ela aparecerá aqui. Valores de moedas
                diferentes não são somados.
              </p>
            </div>
          )}
          {visible.map((item) => {
            const isRead = read.includes(item.id);
            return (
              <article
                key={item.id}
                className={styles.notificationItem}
                data-read={isRead}
                data-notification-id={item.id}
                ref={(element) => {
                  if (!element) return;
                  cards.current.add(element);
                  return () => {
                    cards.current.delete(element);
                  };
                }}
                aria-label={`${item.title} · ${isRead ? 'Lida' : 'Não lida'}`}
              >
                <div className={styles.notificationItemTop}>
                  <item.Icon aria-hidden />
                  <strong>{item.title}</strong>
                  <time>{item.date}</time>
                </div>
                {item.group === 'Tarefas' ? (
                  <>
                    <div className={styles.notificationTaskMeta}>
                      <span
                        className={styles.notificationTag}
                        data-tone={taskStatuses[item.id] === 'Pendente' ? 'warning' : 'neutral'}
                      >
                        {taskStatuses[item.id]}
                      </span>
                      <span>Prazo: {item.value}</span>
                    </div>
                    <p className={styles.notificationTaskDetail}>{item.detail}</p>
                    <p className={styles.notificationTaskDetail}>{item.offer}</p>
                    <div className={styles.notificationTaskActions}>
                      {['Pendente', 'Em progresso', 'Concluída'].map((status) => (
                        <Button
                          key={status}
                          variant="outline"
                          className={styles.secondary}
                          disabled={busy || tabPhase !== 'idle' || taskStatuses[item.id] === status}
                          aria-pressed={taskStatuses[item.id] === status}
                          onClick={() => {
                            if (status === 'Concluída') void mark([item.id], true);
                            else {
                              setTaskStatuses((previous) => ({ ...previous, [item.id]: status }));
                              setMessage(
                                `Status alterado para ${status} apenas nesta demonstração.`,
                              );
                            }
                          }}
                        >
                          {status}
                        </Button>
                      ))}
                    </div>
                  </>
                ) : (
                  <>
                    <p
                      className={styles.notificationValue}
                      data-private={privateMode && item.group === 'Vendas'}
                    >
                      {privateMode && item.group === 'Vendas' ? '••••••' : item.value}
                    </p>
                    <div className={styles.row}>
                      <span
                        className={styles.notificationTag}
                        data-tone={item.tag === 'Upsell' ? 'warning' : 'neutral'}
                      >
                        {item.tag}
                      </span>
                      {item.group === 'Vendas' && (
                        <span className={styles.notificationTag}>VendePay</span>
                      )}
                    </div>
                    <dl>
                      <dt>Oferta / contexto</dt>
                      <dd>{item.offer}</dd>
                      <dt>{item.detail.split(' · ')[0]}</dt>
                      <dd>{item.detail.split(' · ').slice(1).join(' · ')}</dd>
                    </dl>
                  </>
                )}
                <Button
                  variant="ghost"
                  className={styles.secondary}
                  disabled={isRead || busy}
                  onClick={() => mark([item.id])}
                >
                  <CircleCheck aria-hidden />
                  {isRead
                    ? item.group === 'Tarefas'
                      ? 'Lida · permanece até a conclusão'
                      : 'Lida'
                    : 'Marcar como lida'}
                </Button>
              </article>
            );
          })}
        </div>
      </div>
      <footer className={styles.notificationFooter}>
        <output>{message}</output>
        {undo && (
          <Button
            className={styles.secondary}
            variant="ghost"
            disabled={busy}
            onClick={() => {
              setRead(undo.read);
              setCompleted(undo.completed);
              setUndo(null);
              setMessage('Leitura local desfeita.');
            }}
          >
            Desfazer ação
          </Button>
        )}
        <small>
          Vendas saem ao ler. Tarefas e calls permanecem; concluir uma tarefa anima sua saída.
        </small>
      </footer>
    </div>
  );
  return (
    <div className={styles.twoColumns}>
      {panel()}
      <div className={styles.formStack}>
        <h3>A mesma informação, com menos ruído</h3>
        <p>
          Vidro translúcido, contorno neutro e verde apenas no sinal de venda. Tipo, origem, moeda e
          oferta continuam visíveis.
        </p>
        <p>
          Filtros e ações ficam fixos; apenas a lista rola. Vendas saem ao ler; tarefas e calls
          permanecem. Concluir tarefa é uma ação separada, com saída animada. “Marcar exibidas” atua
          somente na categoria aberta e Desfazer restaura os cartões.
        </p>
        <p>
          O exemplo inclui Vendas, Tarefas, Calls e Financeiro vazio. As contagens representam esta
          amostra; não reproduzem os dados reais do print.
        </p>
        <Dialog>
          <DialogTrigger asChild>
            <Button className={styles.primary}>Abrir painel lateral de notificações</Button>
          </DialogTrigger>
          <DialogContent
            className={`tmx-glass-reference ${styles.overlay} ${styles.notificationsDrawer}`}
            overlayClassName={`${styles.notificationsBackdrop} ${motion ? '' : styles.notificationsNoMotion}`}
            data-theme={theme}
            data-motion={motion ? 'on' : 'off'}
          >
            <DialogHeader className={styles.srOnly}>
              <DialogTitle>Central de notificações · demonstração</DialogTitle>
              <DialogDescription>
                Painel fictício. Escape fecha e devolve o foco ao botão de abertura.
              </DialogDescription>
            </DialogHeader>
            {panel()}
          </DialogContent>
        </Dialog>
        <p className={styles.caption}>
          A demonstração não altera leitura, permissões ou preferências no TMX real.
        </p>
      </div>
    </div>
  );
}
