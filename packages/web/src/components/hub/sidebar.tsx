'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/lib/auth-context';
import { useTaskManagementAccess } from '@/lib/hooks/use-task-management-access';
import { cn } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import type { NavItem } from './nav-config';
import { navigationHref, resolveNavigation, visibleNavigation } from './navigation';

const EXPANDED_STORAGE_KEY = 'tmx-ui.sidebar.expanded';

interface SidebarProps {
  collapsed: boolean;
  onCollapse: () => void;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export function NavigationItem({
  item,
  collapsed = false,
  expanded,
  onExpandedChange,
  pathname,
  search,
  activeLeafId,
  activeRootId,
  mobile = false,
  onNavigate,
}: {
  item: NavItem;
  collapsed?: boolean;
  expanded: boolean;
  onExpandedChange: () => void;
  pathname: string;
  search: string;
  activeLeafId?: string;
  activeRootId?: string;
  mobile?: boolean;
  onNavigate?: () => void;
}) {
  const children = item.children ?? [];
  const Icon = item.icon;
  const active = item.id === activeRootId;
  const submenuId = `${mobile ? 'mobile' : 'desktop'}-submenu-${item.id}`;
  const submenuOpen = expanded && !collapsed;
  const itemClass = cn(
    'nav-item relative min-h-11 w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
  );

  if (children.length === 0) {
    return (
      <Link
        prefetch={true}
        href={navigationHref(item, pathname, search)}
        onClick={onNavigate}
        aria-current={item.id === activeLeafId ? 'page' : undefined}
        aria-label={collapsed ? item.label : undefined}
        title={collapsed ? item.label : undefined}
        className={itemClass}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="tmx-sidebar-label" aria-hidden={collapsed || undefined}>
          {item.label}
        </span>
      </Link>
    );
  }

  return (
    <div>
      <button
        type="button"
        aria-expanded={submenuOpen}
        aria-controls={submenuId}
        aria-label={collapsed ? item.label : undefined}
        data-active-group={active}
        onClick={onExpandedChange}
        className={cn(itemClass, active && 'bg-accent/50 text-foreground')}
      >
        <Icon className="h-4 w-4 shrink-0" aria-hidden />
        <span className="tmx-sidebar-label" aria-hidden={collapsed || undefined}>
          {item.label}
        </span>
        <ChevronDown
          className={cn(
            'tmx-sidebar-chevron h-3.5 w-3.5 shrink-0 transition-transform motion-reduce:transition-none',
            submenuOpen && 'rotate-180',
          )}
          aria-hidden
        />
      </button>
      <div
        id={submenuId}
        data-expanded={submenuOpen}
        aria-hidden={!submenuOpen}
        className="tmx-sidebar-submenu ml-4 border-l border-border/60 pl-3"
      >
        <div className="space-y-0.5 py-1">
          {children.map((child) => {
            const ChildIcon = child.icon;
            return (
              <Link
                prefetch={submenuOpen}
                key={child.id}
                href={navigationHref(child, pathname, search)}
                tabIndex={submenuOpen ? undefined : -1}
                onClick={onNavigate}
                aria-current={child.id === activeLeafId ? 'page' : undefined}
                className="nav-item min-h-11 px-2.5 py-2 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <ChildIcon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">{child.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export function Sidebar({ collapsed, onCollapse, mobileOpen, onMobileOpenChange }: SidebarProps) {
  const [hovered, setHovered] = useState(false);
  const desktopCollapsed = collapsed && !hovered;
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const { user } = useAuth();
  const { canManageTasks } = useTaskManagementAccess();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const visibleNav = useMemo(
    () => visibleNavigation(user, undefined, { canManageTasks }),
    [user, canManageTasks],
  );
  const active = useMemo(
    () => resolveNavigation(pathname, search, visibleNav),
    [pathname, search, visibleNav],
  );
  const activeRootId = active?.root.id;

  useEffect(() => {
    if (active) {
      setExpandedId(active.root.id);
      return;
    }
    try {
      const stored = window.localStorage.getItem(EXPANDED_STORAGE_KEY);
      setExpandedId(visibleNav.some((item) => item.id === stored) ? stored : null);
    } catch {
      setExpandedId(null);
    }
  }, [active, visibleNav]);

  const changeExpanded = (id: string) => {
    const next = expandedId === id ? null : id;
    setExpandedId(next);
    try {
      if (next) window.localStorage.setItem(EXPANDED_STORAGE_KEY, next);
      else window.localStorage.removeItem(EXPANDED_STORAGE_KEY);
    } catch {
      // Navigation remains usable when browser storage is unavailable.
    }
  };

  const renderItems = (mobile: boolean) =>
    visibleNav.map((item) => (
      <NavigationItem
        key={item.id}
        item={item}
        collapsed={!mobile && desktopCollapsed}
        mobile={mobile}
        expanded={expandedId === item.id}
        onExpandedChange={() => changeExpanded(item.id)}
        pathname={pathname}
        search={search}
        activeLeafId={active?.item.id}
        activeRootId={activeRootId}
        onNavigate={mobile ? () => onMobileOpenChange(false) : undefined}
      />
    ));

  return (
    <>
      <aside
        aria-label="Navegação principal"
        data-collapsed={desktopCollapsed}
        onMouseEnter={() => setHovered(true)}
        onFocus={() => setHovered(true)}
        onMouseLeave={(event) => {
          const focus = document.activeElement;
          if (!focus || !event.currentTarget.contains(focus) || !focus.matches(':focus-visible')) {
            setHovered(false);
            onCollapse();
          }
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setHovered(false);
            onCollapse();
          }
        }}
        className="tmx-sidebar hidden shrink-0 flex-col border-r border-border/60 bg-background/88 px-2 py-3 backdrop-blur-xl xl:flex"
      >
        <p
          className="tmx-sidebar-heading text-[11px] font-medium text-muted-foreground"
          aria-hidden={desktopCollapsed}
        >
          Navegação
        </p>
        <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto overflow-x-visible">
          {renderItems(false)}
        </nav>
        <div className="tmx-sidebar-foot">
          <span className="tmx-sidebar-avatar" aria-hidden>
            {user?.name
              .split(/\s+/)
              .map((part) => part[0])
              .slice(0, 2)
              .join('')
              .toUpperCase()}
          </span>
          <div className="tmx-sidebar-user" aria-hidden={desktopCollapsed}>
            <p>{user?.name}</p>
            <small>TMX HUB · v0.10.0</small>
          </div>
        </div>
      </aside>
      <Dialog open={mobileOpen} onOpenChange={onMobileOpenChange}>
        <DialogContent
          onCloseAutoFocus={(event) => {
            const trigger = document.getElementById('tmx-mobile-navigation-trigger');
            if (trigger && trigger.getClientRects().length > 0) {
              event.preventDefault();
              trigger.focus({ preventScroll: true });
            }
          }}
          className="tmx-sidebar-dialog bottom-0 left-0 top-0 h-dvh max-h-none w-[min(88vw,360px)] max-w-none grid-rows-[auto_minmax(0,1fr)] rounded-none border-y-0 border-l-0 border-r border-border/60 bg-background p-4 sm:h-dvh sm:w-[360px] sm:max-w-none sm:p-4 [&>button]:h-11 [&>button]:w-11 xl:hidden"
        >
          <DialogHeader className="border-b border-border/60 pb-3 pr-12">
            <DialogTitle>TMX HUB</DialogTitle>
            <DialogDescription>Navegue pelas áreas disponíveis.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-y-auto pt-1">
            <nav aria-label="Navegação móvel" className="space-y-1 pb-4">
              {renderItems(true)}
            </nav>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
