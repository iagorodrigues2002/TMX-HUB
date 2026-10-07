'use client';

import { useInterfaceTheme } from '@/components/theme-provider';
import { Button } from '@/components/ui/button';
import { DataState } from '@/components/ui/data-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { apiClient, canAccessTool } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { usePrivacy } from '@/lib/privacy-context';
import { cn } from '@/lib/utils';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Eye, KeyRound, LogOut, Moon, Plus, RefreshCw, Search, Store, Sun } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { type KeyboardEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { type NavItem, flattenNavItems } from './nav-config';
import { OPEN_OFFER_SWITCHER_EVENT, useOfferContext } from './offer-context-switcher';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CommandEntry {
  id: string;
  label: string;
  detail: string;
  keywords: string[];
  icon: NavItem['icon'];
  run: () => void | Promise<void>;
}

function isTypingTarget(target: Element | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

function navVisible(item: NavItem, user: ReturnType<typeof useAuth>['user']) {
  if (!user || item.hidden || item.href.includes('[id]')) return false;
  if (item.roles && !item.roles.includes(user.role)) return false;
  if (item.requiresTool && !canAccessTool(user, item.requiresTool)) return false;
  return true;
}

function searchable(entry: CommandEntry, query: string) {
  const haystack = [entry.label, entry.detail, ...entry.keywords]
    .join(' ')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  const needle = query
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
  return haystack.includes(needle);
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const { user, logout } = useAuth();
  const { isPrivate, togglePrivacy } = usePrivacy();
  const { theme, toggleTheme } = useInterfaceTheme();
  const { offers, currentOffer, setCurrentOfferId } = useOfferContext();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const syncMutation = useMutation({
    mutationFn: (offerId: string) => apiClient.syncOffer(offerId),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['offers'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard-summary'] });
      toast.success(
        result.skipped
          ? 'A oferta já estava sincronizando.'
          : `${result.ads} anúncios atualizados.`,
      );
    },
    onError: (error) => toast.error((error as Error).message),
  });

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        onOpenChange(!open);
        return;
      }
      if (event.key === '/' && !open && !isTypingTarget(document.activeElement)) {
        event.preventDefault();
        onOpenChange(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onOpenChange]);

  useEffect(() => {
    if (!open) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [open]);

  const closeThen = (action: () => void | Promise<void>) => {
    onOpenChange(false);
    requestAnimationFrame(() => void action());
  };

  const navigation = useMemo<CommandEntry[]>(
    () =>
      flattenNavItems()
        .filter((item) => navVisible(item, user))
        .map((item) => ({
          id: `nav-${item.id}`,
          label: item.label,
          detail: item.group,
          keywords: item.keywords ?? [],
          icon: item.icon,
          run: () => router.push(item.href),
        })),
    [router, user],
  );

  const offerNavigation = useMemo<CommandEntry[]>(
    () =>
      offers.map((offer) => ({
        id: `offer-${offer.id}`,
        label: offer.name,
        detail: offer.companyName ? `Oferta · ${offer.companyName}` : 'Oferta',
        keywords: ['oferta', offer.companyName ?? ''],
        icon: Store,
        run: () => {
          setCurrentOfferId(offer.id);
          router.push(`/ofertas/${offer.id}`);
        },
      })),
    [offers, router, setCurrentOfferId],
  );

  const actions = useMemo<CommandEntry[]>(() => {
    const entries: CommandEntry[] = [
      {
        id: 'action-refresh',
        label: 'Atualizar dados',
        detail: 'Ação',
        keywords: ['recarregar', 'refresh', pathname],
        icon: RefreshCw,
        run: async () => {
          await queryClient.invalidateQueries();
          toast.success('Dados atualizados.');
        },
      },
      {
        id: 'action-privacy',
        label: isPrivate ? 'Mostrar valores financeiros' : 'Ocultar valores financeiros',
        detail: 'Ação',
        keywords: ['alternar privacidade', 'financeiro'],
        icon: Eye,
        run: togglePrivacy,
      },
      {
        id: 'action-theme',
        label: theme === 'dark' ? 'Usar tema claro' : 'Usar tema escuro',
        detail: 'Ação',
        keywords: ['alternar tema', 'aparência', 'dark', 'light'],
        icon: theme === 'dark' ? Sun : Moon,
        run: toggleTheme,
      },
      {
        id: 'action-security',
        label: 'Conta e segurança',
        detail: 'Ação',
        keywords: ['perfil', 'senha'],
        icon: KeyRound,
        run: () => router.push('/settings'),
      },
      {
        id: 'action-logout',
        label: 'Sair',
        detail: 'Sessão',
        keywords: ['logout', 'encerrar sessão'],
        icon: LogOut,
        run: logout,
      },
    ];

    if (user && canAccessTool(user, 'ofertas')) {
      entries.unshift({
        id: 'action-create-offer',
        label: 'Criar oferta',
        detail: 'Ação',
        keywords: ['nova oferta', 'adicionar'],
        icon: Plus,
        run: () => router.push('/ofertas?action=create'),
      });
    }

    if (offers.length > 0) {
      entries.unshift({
        id: 'action-switch-offer',
        label: 'Trocar oferta atual',
        detail: 'Ação',
        keywords: ['selecionar oferta', 'contexto'],
        icon: Store,
        run: () => {
          window.dispatchEvent(new Event(OPEN_OFFER_SWITCHER_EVENT));
        },
      });
    }

    if (currentOffer?.canManage) {
      entries.unshift({
        id: 'action-sync-offer',
        label: `Sincronizar ${currentOffer.name}`,
        detail: 'Ação',
        keywords: ['sincronizar oferta', 'utmify'],
        icon: RefreshCw,
        run: () => syncMutation.mutate(currentOffer.id),
      });
    }

    return entries;
  }, [
    currentOffer,
    isPrivate,
    logout,
    offers.length,
    pathname,
    queryClient,
    router,
    syncMutation,
    theme,
    togglePrivacy,
    toggleTheme,
    user,
  ]);

  const allEntries = useMemo(
    () => [...actions, ...navigation, ...offerNavigation],
    [actions, navigation, offerNavigation],
  );
  const filtered = useMemo(
    () => allEntries.filter((entry) => searchable(entry, query)).slice(0, 18),
    [allEntries, query],
  );

  const runEntry = (entry: CommandEntry) => closeThen(entry.run);
  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && filtered[activeIndex]) {
      event.preventDefault();
      runEntry(filtered[activeIndex]);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
        className="tmx-command-palette top-[12vh] max-h-[min(72vh,680px)] max-w-2xl gap-0 overflow-hidden border-border/60 bg-popover p-0 sm:p-0"
      >
        <DialogHeader className="sr-only">
          <DialogTitle>Buscar ou executar</DialogTitle>
          <DialogDescription>Navegue pelo TMX HUB ou execute uma ação.</DialogDescription>
        </DialogHeader>

        <div className="flex h-14 items-center gap-3 border-b border-border/60 px-4 pr-14">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onInputKeyDown}
            aria-label="Buscar comandos e destinos"
            placeholder="Buscar destino ou executar uma ação…"
            className="h-full min-w-0 flex-1 bg-transparent text-base text-foreground outline-none placeholder:text-muted-foreground sm:text-[13px]"
          />
          <kbd className="hidden rounded border border-border/60 bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground sm:block">
            esc
          </kbd>
        </div>

        <div className="min-h-0 overflow-y-auto p-2">
          {filtered.length === 0 ? (
            <DataState
              variant="empty"
              title="Nenhum resultado"
              description="Tente buscar pelo nome de uma área, oferta ou ação."
              className="min-h-40 border-0 bg-transparent shadow-none"
            />
          ) : (
            <div aria-label="Resultados" className="space-y-0.5">
              {filtered.map((entry, index) => {
                const Icon = entry.icon;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    data-active={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runEntry(entry)}
                    className={cn(
                      'flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-md px-3 text-left text-[13px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground',
                      index === activeIndex && 'bg-accent text-foreground',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="min-w-0 flex-1 truncate font-medium">{entry.label}</span>
                    <span className="text-[11px] text-muted-foreground">{entry.detail}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
          <span>↑↓ navegar · enter abrir</span>
          <span>{filtered.length} resultados</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
