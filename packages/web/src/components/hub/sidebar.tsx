'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { canAccessTool } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { NAV_ITEMS, type NavItem } from './nav-config';

const EXPANDED_STORAGE_KEY = 'tmx-ui.sidebar.expanded';

interface SidebarProps {
  collapsed: boolean;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

function baseHref(href: string) {
  return href.split('?')[0]?.replace('/[id]', '') ?? href;
}

function itemIsActive(item: NavItem, pathname: string, search: string) {
  if (item.href.includes('[id]')) return pathname.startsWith(baseHref(item.href));

  const [itemPath, itemSearch] = item.href.split('?');
  if (itemSearch) {
    const expected = new URLSearchParams(itemSearch);
    const current = new URLSearchParams(search);
    return (
      pathname === itemPath &&
      Array.from(expected.entries()).every(([key, value]) => current.get(key) === value)
    );
  }

  if (item.href === '/') return pathname === '/';
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function visibleForUser(item: NavItem, user: ReturnType<typeof useAuth>['user']) {
  if (item.hidden || !user) return false;
  if (item.href.includes('[id]')) return false;
  if (item.roles && !item.roles.includes(user.role)) return false;
  if (item.requiresTool && !canAccessTool(user, item.requiresTool)) return false;
  return true;
}

function DesktopItem({
  item,
  collapsed,
  expanded,
  onExpandedChange,
  pathname,
  search,
  user,
}: {
  item: NavItem;
  collapsed: boolean;
  expanded: boolean;
  onExpandedChange: () => void;
  pathname: string;
  search: string;
  user: ReturnType<typeof useAuth>['user'];
}) {
  const visibleChildren = (item.children ?? []).filter((child) => visibleForUser(child, user));
  const ownActive = itemIsActive(item, pathname, search);
  const childActive = visibleChildren.some((child) => itemIsActive(child, pathname, search));
  const active = ownActive || childActive;
  const Icon = item.icon;

  return (
    <div>
      <div className={cn('group/row relative flex items-center', !collapsed && 'gap-1')}>
        <Link
          href={item.href}
          aria-current={active ? 'page' : undefined}
          aria-label={collapsed ? item.label : undefined}
          className={cn('nav-item min-w-0 flex-1', collapsed && 'justify-center px-0')}
        >
          <Icon className="h-4 w-4 shrink-0" aria-hidden />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </Link>
        {!collapsed && visibleChildren.length > 0 && (
          <button
            type="button"
            aria-label={`${expanded ? 'Recolher' : 'Expandir'} ${item.label}`}
            aria-expanded={expanded}
            onClick={onExpandedChange}
            className="grid h-9 w-9 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronDown
              className={cn('h-3.5 w-3.5 transition-transform', expanded && 'rotate-180')}
              aria-hidden
            />
          </button>
        )}
        {collapsed && (
          <span
            role="tooltip"
            className="pointer-events-none absolute left-[calc(100%+10px)] top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-md border border-border/60 bg-popover px-2.5 py-1.5 text-xs font-medium text-popover-foreground opacity-0 shadow-card transition-opacity group-hover/row:opacity-100 group-focus-within/row:opacity-100"
          >
            {item.label}
          </span>
        )}
      </div>

      {!collapsed && expanded && visibleChildren.length > 0 && (
        <div className="ml-4 border-l border-border/60 py-1 pl-3">
          <p className="px-2 pb-1 pt-2 text-[11px] font-medium text-muted-foreground">
            {item.label}
          </p>
          <div className="space-y-0.5">
            {visibleChildren.map((child) => {
              const ChildIcon = child.icon;
              const childIsActive = itemIsActive(child, pathname, search);
              return (
                <Link
                  key={child.id}
                  href={child.href}
                  aria-current={childIsActive ? 'page' : undefined}
                  className="nav-item min-h-9 px-2.5 py-2 text-xs"
                >
                  <ChildIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="truncate">{child.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function MobileNavigation({
  items,
  pathname,
  search,
  onNavigate,
}: {
  items: NavItem[];
  pathname: string;
  search: string;
  onNavigate: () => void;
}) {
  return (
    <nav aria-label="Navegação móvel" className="space-y-4 pb-4">
      {items.map((item) => {
        const Icon = item.icon;
        const children = item.children ?? [];
        const active = itemIsActive(item, pathname, search);
        return (
          <section key={item.id} aria-labelledby={`mobile-nav-${item.id}`}>
            <p
              id={`mobile-nav-${item.id}`}
              className="mb-1 px-3 text-[11px] font-medium text-muted-foreground"
            >
              {item.group}
            </p>
            <Link
              href={item.href}
              onClick={onNavigate}
              aria-current={active ? 'page' : undefined}
              className="nav-item min-h-11"
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span>{item.label}</span>
            </Link>
            {children.length > 0 && (
              <div className="ml-5 border-l border-border/60 pl-3">
                {children.map((child) => {
                  const ChildIcon = child.icon;
                  return (
                    <Link
                      key={child.id}
                      href={child.href}
                      onClick={onNavigate}
                      aria-current={itemIsActive(child, pathname, search) ? 'page' : undefined}
                      className="nav-item min-h-11 px-3 py-2.5"
                    >
                      <ChildIcon className="h-4 w-4" aria-hidden />
                      <span>{child.label}</span>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}
    </nav>
  );
}

export function Sidebar({ collapsed, mobileOpen, onMobileOpenChange }: SidebarProps) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { user } = useAuth();
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visibleNav = useMemo(
    () =>
      NAV_ITEMS.filter((item) => visibleForUser(item, user)).map((item) => ({
        ...item,
        children: (item.children ?? []).filter((child) => visibleForUser(child, user)),
      })),
    [user],
  );

  useEffect(() => {
    const stored = window.localStorage.getItem(EXPANDED_STORAGE_KEY);
    const activeRoot = visibleNav.find((item) =>
      [item, ...(item.children ?? [])].some((candidate) =>
        itemIsActive(candidate, pathname, search),
      ),
    );
    setExpandedId(stored ?? activeRoot?.id ?? null);
  }, [pathname, search, visibleNav]);

  const changeExpanded = (id: string) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    if (next) window.localStorage.setItem(EXPANDED_STORAGE_KEY, next);
    else window.localStorage.removeItem(EXPANDED_STORAGE_KEY);
  };

  return (
    <>
      <aside
        aria-label="Navegação principal"
        data-collapsed={collapsed}
        className={cn(
          'hidden shrink-0 flex-col border-r border-border/60 bg-background/88 px-2 py-3 backdrop-blur-xl lg:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        {!collapsed && (
          <p className="px-2 pb-2 text-[11px] font-medium text-muted-foreground">Navegação</p>
        )}
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-visible">
          {visibleNav.map((item) => (
            <DesktopItem
              key={item.id}
              item={item}
              collapsed={collapsed}
              expanded={expandedId === item.id}
              onExpandedChange={() => changeExpanded(item.id)}
              pathname={pathname}
              search={search}
              user={user}
            />
          ))}
        </nav>

        {!collapsed && (
          <div className="mt-3 border-t border-border/60 px-2 pt-3">
            <p className="text-[11px] text-muted-foreground">TMX HUB · v0.10.0</p>
          </div>
        )}
      </aside>

      <Dialog open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DialogContent className="bottom-0 left-0 top-0 h-dvh max-h-none w-[min(88vw,360px)] max-w-none translate-x-0 translate-y-0 rounded-none border-y-0 border-l-0 border-r border-border/60 bg-background p-4 sm:h-dvh sm:w-[360px] sm:max-w-none sm:p-4 lg:hidden">
          <DialogHeader className="border-b border-border/60 pb-3 pr-12">
            <DialogTitle>TMX HUB</DialogTitle>
            <DialogDescription>Navegue pelas áreas disponíveis.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto pt-1">
            <MobileNavigation
              items={visibleNav}
              pathname={pathname}
              search={search}
              onNavigate={() => onMobileOpenChange(false)}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
