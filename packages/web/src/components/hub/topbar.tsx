'use client';

import { Button } from '@/components/ui/button';
import { Bell, Menu, PanelLeftClose, PanelLeftOpen, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { NAV_ITEMS, type NavItem, flattenNavItems } from './nav-config';
import { OfferContextSwitcher } from './offer-context-switcher';

interface TopbarProps {
  breadcrumb?: string[];
  right?: ReactNode;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileNavigation: () => void;
  onOpenCommandPalette?: () => void;
  notificationCount?: number;
  onOpenNotifications?: () => void;
}

interface BreadcrumbItem {
  label: string;
  href?: string;
}

const ROOT_PATHS = new Set(['/', '/ofertas', '/tracking', '/tools', '/admin']);

function normalizeLabel(label: string) {
  if (label !== label.toUpperCase()) return label;
  return label
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|\s)\p{L}/gu, (letter) => letter.toLocaleUpperCase('pt-BR'));
}

function hrefMatches(item: NavItem, pathname: string, search: URLSearchParams) {
  const [itemPath, itemQuery] = item.href.split('?');
  if (itemPath?.includes('[id]')) {
    const pattern = new RegExp(`^${itemPath.replace('[id]', '[^/]+')}$`);
    return pattern.test(pathname);
  }
  if (itemPath !== pathname && !pathname.startsWith(`${itemPath}/`)) return false;
  if (!itemQuery) return true;
  const expected = new URLSearchParams(itemQuery);
  return Array.from(expected.entries()).every(([key, value]) => search.get(key) === value);
}

function navTrail(pathname: string, search: URLSearchParams): NavItem[] {
  for (const root of NAV_ITEMS) {
    const child = (root.children ?? [])
      .filter((item) => !item.hidden && hrefMatches(item, pathname, search))
      .sort((a, b) => b.href.length - a.href.length)[0];
    if (child) return [root, child];
  }

  const root = NAV_ITEMS.find((item) => !item.hidden && hrefMatches(item, pathname, search));
  return root ? [root] : [];
}

function deriveBreadcrumbs(
  pathname: string,
  search: URLSearchParams,
  override?: string[],
): BreadcrumbItem[] {
  const plainRoot = ROOT_PATHS.has(pathname) && search.size === 0;
  if (plainRoot) return [];

  const trail = navTrail(pathname, search);
  const crumbs: BreadcrumbItem[] = trail.map((item) => ({
    label: item.label,
    href: item.href.includes('[id]') ? undefined : item.href,
  }));

  if (trail.at(-1)?.href.includes('[id]') && override?.at(-1)) {
    crumbs[crumbs.length - 1] = { label: normalizeLabel(override.at(-1) ?? '') };
  } else if (override && override.length > trail.length) {
    const dynamicLabel = normalizeLabel(override.at(-1) ?? '');
    const knownLabels = new Set(flattenNavItems().map((item) => item.label.toLowerCase()));
    if (!knownLabels.has(dynamicLabel.toLowerCase())) crumbs.push({ label: dynamicLabel });
  }

  if (crumbs.length === 0 && override && override.length > 1) {
    return override.map((label, index) => ({
      label: normalizeLabel(label),
      href: index === 0 ? `/${pathname.split('/').filter(Boolean)[0] ?? ''}` : undefined,
    }));
  }

  return crumbs.map((crumb, index) =>
    index === crumbs.length - 1 ? { label: crumb.label } : crumb,
  );
}

function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  if (items.length < 2) return null;
  const parent = items.at(-2);
  const current = items.at(-1);

  return (
    <nav aria-label="Breadcrumb" className="tmx-breadcrumb min-w-0">
      <div className="flex min-w-0 items-center gap-1.5 text-[13px] md:hidden">
        {parent?.href && (
          <Link
            href={parent.href}
            className="shrink-0 text-muted-foreground transition-colors hover:text-foreground"
          >
            ← {parent.label}
          </Link>
        )}
        <span aria-hidden className="text-muted-foreground/50">
          /
        </span>
        <span aria-current="page" className="truncate font-medium text-foreground">
          {current?.label}
        </span>
      </div>
      <ol className="hidden min-w-0 items-center gap-1.5 text-[13px] md:flex">
        {items.map((item, index) => (
          <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
            {index > 0 && (
              <span aria-hidden className="text-muted-foreground/40">
                /
              </span>
            )}
            {item.href ? (
              <Link
                href={item.href}
                className="truncate text-muted-foreground transition-colors hover:text-foreground"
              >
                {item.label}
              </Link>
            ) : (
              <span aria-current="page" className="truncate font-medium text-foreground">
                {item.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Topbar({
  breadcrumb,
  right,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenMobileNavigation,
  onOpenCommandPalette,
  notificationCount = 0,
  onOpenNotifications,
}: TopbarProps) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const breadcrumbs = deriveBreadcrumbs(pathname, searchParams, breadcrumb);

  return (
    <header className="tmx-topbar relative z-30 flex h-14 shrink-0 items-center gap-1.5 border-b border-border/60 bg-background/92 px-2 backdrop-blur-xl sm:gap-2 sm:px-3">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onOpenMobileNavigation}
        aria-label="Abrir navegação"
        className="h-11 w-11 xl:hidden"
      >
        <Menu className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onToggleSidebar}
        aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
        className="hidden xl:inline-flex"
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="h-4 w-4" />
        ) : (
          <PanelLeftClose className="h-4 w-4" />
        )}
      </Button>

      <Link
        href="/"
        aria-label="Ir para a visão geral"
        className="flex shrink-0 items-center gap-2"
      >
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-md border border-border/60 bg-muted"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 text-primary"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12h4l3-9 4 18 3-9h4" />
          </svg>
        </span>
        <span className="hidden text-sm font-bold tracking-tight text-foreground xl:inline">
          TMX HUB
        </span>
      </Link>

      <div className="hidden h-5 w-px bg-border/60 md:block" aria-hidden />
      <div className="min-w-0 flex-1">
        <Breadcrumbs key={`${pathname}?${searchParams.toString()}`} items={breadcrumbs} />
      </div>

      <OfferContextSwitcher />

      {onOpenCommandPalette && (
        <Button
          type="button"
          variant="outline"
          onClick={onOpenCommandPalette}
          aria-label="Abrir busca e comandos"
          className="h-9 w-9 shrink-0 justify-center border-border/60 bg-muted/60 px-0 font-normal text-muted-foreground xl:w-auto xl:min-w-[180px] xl:justify-between xl:px-3"
        >
          <span className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden xl:inline">Buscar ou executar…</span>
          </span>
          <kbd className="hidden rounded border border-border/60 bg-background px-1.5 py-0.5 text-[11px] xl:inline">
            ⌘K
          </kbd>
        </Button>
      )}

      {onOpenNotifications && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onOpenNotifications}
          aria-label={
            notificationCount > 0
              ? `${notificationCount} ${notificationCount === 1 ? 'notificação nova' : 'notificações novas'}`
              : 'Notificações'
          }
          className="relative h-11 w-11 shrink-0 sm:h-9 sm:w-9"
        >
          <Bell className="h-4 w-4" aria-hidden />
          {notificationCount > 0 && (
            <span className="absolute right-2 top-2 flex h-2 w-2" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger opacity-70" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-danger" />
            </span>
          )}
        </Button>
      )}

      <div className="flex shrink-0 items-center gap-1">{right}</div>
    </header>
  );
}
