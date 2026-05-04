'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ScrollText, User, Wrench } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: typeof Home;
  /** When true, the item is rendered but not clickable (placeholder). */
  disabled?: boolean;
}

const NAV: NavItem[] = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Tools', href: '/tools', icon: Wrench },
  { label: 'Logs', href: '/logs', icon: ScrollText },
  { label: 'Conta', href: '#', icon: User, disabled: true },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      aria-label="Navegação principal"
      className="hidden w-[240px] shrink-0 flex-col gap-1 border-r border-white/[0.06] bg-[#04101A]/40 p-4 lg:flex"
    >
      <p className="hud-label px-3 pb-2">Menu</p>
      <nav className="flex flex-col gap-1">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive =
            !item.disabled &&
            (item.href === '/'
              ? pathname === '/'
              : pathname === item.href || pathname.startsWith(`${item.href}/`));

          if (item.disabled) {
            return (
              <span
                key={item.label}
                aria-disabled
                className="nav-item cursor-not-allowed opacity-40"
                title="Em breve"
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
                <span className="ml-auto text-[9px] uppercase tracking-[0.18em] text-white/30">
                  Soon
                </span>
              </span>
            );
          }

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
        })}
      </nav>

      <div className="mt-auto pt-4">
        <div className="rounded-md border border-white/[0.06] bg-white/[0.02] p-3">
          <p className="hud-label">Build</p>
          <p className="mt-1 font-mono text-[11px] text-white/55">v0.9.3</p>
          <p className="mt-2 flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/45">
            <span className="status-dot" aria-hidden /> ONLINE
          </p>
        </div>
      </div>
    </aside>
  );
}
