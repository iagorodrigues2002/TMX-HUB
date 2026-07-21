'use client';

import type { ToolKey } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import { Home, ScrollText, Settings, ShieldCheck, Target, User, Wrench } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavItem {
  label: string;
  href: string;
  icon: typeof Home;
  /** When true, the item is rendered but not clickable (placeholder). */
  disabled?: boolean;
  /** Quando definido, item só aparece se user tem essa tool no allowedTools. */
  requiresTool?: ToolKey;
  adminOnly?: boolean;
}

const NAV: NavItem[] = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Ofertas', href: '/ofertas', icon: Target, requiresTool: 'ofertas' },
  { label: 'Tools', href: '/tools', icon: Wrench },
  { label: 'Logs', href: '/logs', icon: ScrollText, requiresTool: 'logs' },
  { label: 'Admin', href: '/admin', icon: ShieldCheck, adminOnly: true },
  { label: 'Configurações', href: '/settings', icon: Settings, adminOnly: true },
  { label: 'Conta', href: '#', icon: User, disabled: true },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const restricted = user && user.role !== 'admin' && (user.allowedTools?.length ?? 0) > 0;
  const allowed = user?.allowedTools ?? [];

  const visibleNav = NAV.filter((item) => {
    if (item.adminOnly) return user?.role === 'admin';
    if (!item.requiresTool) return true;
    if (!restricted) return true;
    return allowed.includes(item.requiresTool);
  });

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
        className="hidden w-[240px] shrink-0 flex-col gap-1 border-r border-white/[0.06] bg-[#04101A]/40 p-4 lg:flex"
      >
        <p className="hud-label px-3 pb-2">Menu</p>
        <nav className="flex flex-col gap-1">{links}</nav>

        <div className="mt-auto pt-4">
          <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
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
        className="fixed inset-x-3 bottom-3 z-50 flex justify-around rounded-2xl border border-white/[0.10] bg-[#07151e]/95 p-1.5 shadow-2xl backdrop-blur-xl lg:hidden"
      >
        {visibleNav
          .filter((item) => !item.disabled && item.label !== 'Conta')
          .slice(0, 5)
          .map((item) => {
            const Icon = item.icon;
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.label}
                href={item.href}
                className={cn(
                  'flex min-w-14 flex-col items-center gap-1 rounded-xl px-2 py-2 text-[9px] uppercase tracking-wider text-white/45',
                  active && 'bg-cyan-300/[0.10] text-cyan-200',
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
      </nav>
    </>
  );
}
