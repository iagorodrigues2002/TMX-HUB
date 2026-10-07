'use client';

import { Button } from '@/components/ui/button';
import { Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

interface TopbarProps {
  /** Optional breadcrumb segments after the brand. e.g. ['CLONER'] or ['CLONER', 'JOB ABC123']. */
  breadcrumb?: string[];
  /** Right-side slot (status pill, build button, action buttons). */
  right?: ReactNode;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMobileNavigation: () => void;
}

export function Topbar({
  breadcrumb,
  right,
  sidebarCollapsed,
  onToggleSidebar,
  onOpenMobileNavigation,
}: TopbarProps) {
  return (
    <header
      className="tmx-topbar flex h-14 shrink-0 items-center gap-2 border-b border-border/60 bg-background/92 px-2 backdrop-blur-xl sm:px-3"
      style={{ position: 'sticky', top: 0, zIndex: 30 }}
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onOpenMobileNavigation}
        aria-label="Abrir navegação"
        className="h-11 w-11 lg:hidden"
      >
        <Menu className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onToggleSidebar}
        aria-label={sidebarCollapsed ? 'Expandir barra lateral' : 'Recolher barra lateral'}
        className="hidden lg:inline-flex"
      >
        {sidebarCollapsed ? (
          <PanelLeftOpen className="h-4 w-4" />
        ) : (
          <PanelLeftClose className="h-4 w-4" />
        )}
      </Button>
      <Link href="/" className="group flex min-w-0 shrink-0 items-center gap-2">
        <span
          aria-hidden
          className="grid h-8 w-8 place-items-center rounded-md border border-border/60 bg-muted"
          style={{
            background: 'linear-gradient(135deg, rgba(20,184,166,0.25), rgba(34,211,238,0.05))',
          }}
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            className="h-4 w-4 text-cyan-300"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 12h4l3-9 4 18 3-9h4" />
          </svg>
        </span>
        <span className="flex flex-col leading-tight">
          <span className="text-base font-bold tracking-tight text-foreground">
            TMX{' '}
            <span
              className="bg-clip-text text-transparent"
              style={{
                backgroundImage:
                  'linear-gradient(90deg, var(--accent-from) 0%, var(--accent-to) 100%)',
              }}
            >
              HUB
            </span>
          </span>
          <span className="hidden text-[11px] text-muted-foreground sm:block">Operação</span>
        </span>
      </Link>

      {breadcrumb && breadcrumb.length > 0 && (
        <nav
          aria-label="Breadcrumb"
          className="hidden items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/40 md:flex"
        >
          <span aria-hidden className="text-white/40">
            /
          </span>
          {breadcrumb.map((crumb, i) => (
            <span key={crumb} className="flex items-center gap-2">
              <span className={i === breadcrumb.length - 1 ? 'text-white/70' : ''}>{crumb}</span>
              {i < breadcrumb.length - 1 && (
                <span aria-hidden className="text-white/25">
                  ›
                </span>
              )}
            </span>
          ))}
        </nav>
      )}

      <div className="ml-auto flex min-w-0 items-center gap-1.5 sm:gap-2">{right}</div>
    </header>
  );
}
