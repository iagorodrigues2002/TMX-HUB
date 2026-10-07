'use client';

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { ToolKey } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import {
  HeartHandshake,
  Home,
  MoreHorizontal,
  RadioTower,
  RotateCcw,
  Settings,
  ShieldCheck,
  Target,
  User,
  WalletCards,
  Wrench,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useRef } from 'react';

interface NavItem {
  label: string;
  mobileLabel?: string;
  href: string;
  icon: typeof Home;
  /** When true, the item is rendered but not clickable (placeholder). */
  disabled?: boolean;
  /** Quando definido, item só aparece se user tem essa tool no allowedTools. */
  requiresTool?: ToolKey;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { label: 'Visão geral', mobileLabel: 'Início', href: '/', icon: Home },
  { label: 'Ofertas', href: '/ofertas', icon: Target, requiresTool: 'ofertas' },
  {
    label: 'TMX Recovery',
    mobileLabel: 'Recovery',
    href: '/recovery',
    icon: HeartHandshake,
    requiresTool: 'ofertas',
  },
  {
    label: 'Trackeamento avançado',
    mobileLabel: 'Tracking',
    href: '/tracking',
    icon: RadioTower,
    requiresTool: 'ofertas',
  },
  {
    label: 'Reembolsos',
    mobileLabel: 'Reembolsos',
    href: '/reembolsos',
    icon: RotateCcw,
    requiresTool: 'ofertas',
  },
  {
    label: 'Controle de contas',
    mobileLabel: 'Contas',
    href: '/contas-meta',
    icon: WalletCards,
    requiresTool: 'ofertas',
    adminOnly: true,
  },
  { label: 'Ferramentas', href: '/tools', icon: Wrench },
  {
    label: 'Administração',
    mobileLabel: 'Admin',
    href: '/admin',
    icon: ShieldCheck,
    adminOnly: true,
  },
  { label: 'Configurações', href: '/settings', icon: Settings, adminOnly: true },
  { label: 'Conta', href: '#', icon: User, disabled: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const mobileMenuTitleRef = useRef<HTMLHeadingElement>(null);
  const { user } = useAuth();
  const restricted = user && user.role !== 'admin' && (user.allowedTools?.length ?? 0) > 0;
  const allowed = user?.allowedTools ?? [];

  const visibleNav = NAV.filter((item) => {
    if (item.adminOnly) return user?.role === 'admin';
    if (!item.requiresTool) return true;
    if (!restricted) return true;
    return allowed.includes(item.requiresTool);
  });
  const mobileNav = visibleNav.filter((item) => !item.disabled && item.label !== 'Conta');
  const primaryMobileNav = mobileNav.slice(0, 4);
  const secondaryMobileNav = mobileNav.slice(4);
  const secondaryRouteActive = secondaryMobileNav.some((item) =>
    item.href === '/' ? pathname === '/' : pathname.startsWith(item.href),
  );

  const links = visibleNav.map((item) => {
    const Icon = item.icon;
    const isActive =
      !item.disabled &&
      (item.href === '/'
        ? pathname === '/'
        : pathname === item.href || pathname.startsWith(`${item.href}/`));
    if (item.disabled) return null;
    return (
      <Link
        key={item.label}
        href={item.href}
        aria-current={isActive ? 'page' : undefined}
        className={cn('nav-item', isActive && 'active')}
      >
        <Icon className="h-4 w-4" />
        <span>{item.label}</span>
      </Link>
    );
  });

  return (
    <>
      <aside
        aria-label="Navegação principal"
        className="hidden w-[252px] shrink-0 flex-col gap-1 border-r border-cyan-100/[0.08] bg-[#061119]/72 p-4 backdrop-blur-xl lg:flex"
      >
        <p className="hud-label px-3 pb-2">Menu</p>
        <nav className="flex flex-col gap-1">{links}</nav>

        <div className="mt-auto pt-4">
          <div className="rounded-xl border border-cyan-100/[0.10] bg-cyan-100/[0.035] p-3.5">
            <p className="hud-label">Build</p>
            <p className="mt-1 font-mono text-[11px] text-white/55">v0.10.0</p>
            <p className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/45">
              <span className="status-dot" aria-hidden /> ONLINE
            </p>
          </div>
        </div>
      </aside>
      <nav
        aria-label="Navegação móvel"
        className="fixed inset-x-2 bottom-2 z-50 grid grid-cols-5 gap-1 rounded-2xl border border-cyan-100/[0.14] bg-[#081923]/95 p-1.5 pb-[max(.375rem,env(safe-area-inset-bottom))] shadow-2xl shadow-black/50 backdrop-blur-2xl sm:inset-x-3 sm:bottom-3 lg:hidden"
      >
        {primaryMobileNav.map((item) => {
          const Icon = item.icon;
          const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.label}
              href={item.href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center text-[9px] font-semibold uppercase leading-tight tracking-wide text-white/60',
                active && 'bg-cyan-300/[0.10] text-cyan-200',
              )}
            >
              <Icon className="h-4 w-4" />
              <span className="max-w-full truncate">{item.mobileLabel ?? item.label}</span>
            </Link>
          );
        })}
        <Dialog>
          <DialogTrigger asChild>
            <button
              type="button"
              aria-label="Abrir mais opções de navegação"
              className={cn(
                'flex min-h-12 min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 py-1.5 text-center text-[9px] font-semibold uppercase leading-tight tracking-wide text-white/60',
                secondaryRouteActive && 'bg-cyan-300/[0.10] text-cyan-200',
              )}
            >
              <MoreHorizontal className="h-4 w-4" />
              <span>Mais</span>
            </button>
          </DialogTrigger>
          <DialogContent
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              mobileMenuTitleRef.current?.focus();
            }}
            className="bottom-2 left-2 right-2 top-auto w-auto max-w-none translate-x-0 translate-y-0 gap-0 rounded-2xl p-4 sm:bottom-3 sm:left-3 sm:right-3 sm:w-auto sm:max-w-none sm:p-5 lg:hidden"
          >
            <DialogHeader className="pr-12">
              <DialogTitle ref={mobileMenuTitleRef} tabIndex={-1}>
                Mais destinos
              </DialogTitle>
              <DialogDescription>
                Acesse as demais áreas liberadas para sua conta.
              </DialogDescription>
            </DialogHeader>
            <nav aria-label="Mais opções de navegação" className="mt-4 grid gap-2 sm:grid-cols-2">
              {secondaryMobileNav.map((item) => {
                const Icon = item.icon;
                const active =
                  item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <DialogClose key={item.label} asChild>
                    <Link
                      href={item.href}
                      aria-current={active ? 'page' : undefined}
                      className={cn(
                        'flex min-h-12 items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.025] px-4 text-sm font-medium text-white/70 transition-colors hover:border-cyan-300/25 hover:bg-cyan-300/[0.06] hover:text-white',
                        active && 'border-cyan-300/30 bg-cyan-300/[0.08] text-cyan-100',
                      )}
                    >
                      <Icon className="h-4 w-4 text-cyan-300" />
                      <span>{item.label}</span>
                    </Link>
                  </DialogClose>
                );
              })}
            </nav>
          </DialogContent>
        </Dialog>
      </nav>
    </>
  );
}
