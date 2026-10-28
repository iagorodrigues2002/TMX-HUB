'use client';

import { AuthGate } from '@/components/auth/auth-gate';
import { usePathname, useSearchParams } from 'next/navigation';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { AmbientBackground } from './ambient-background';
import { CommandPalette } from './command-palette';
import { FinancialPrivacyMask } from './financial-privacy-mask';
import { MicroFooter } from './micro-footer';
import { OfferContextProvider } from './offer-context-switcher';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { UserMenu } from './user-menu';

interface HubShellProps {
  children: ReactNode;
  breadcrumb?: string[];
  topbarRight?: ReactNode;
  notificationCount?: number;
  onOpenNotifications?: () => void;
  /** When true, the children control their own scroll/layout (e.g. the editor). */
  fullBleed?: boolean;
}

export function HubShell({
  children,
  breadcrumb,
  topbarRight,
  notificationCount,
  onOpenNotifications,
  fullBleed,
}: HubShellProps) {
  const pathname = usePathname();
  const search = useSearchParams();
  const screenKey = `${pathname}:${search.get('view') ?? ''}:${search.get('section') ?? ''}`;
  const content = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = content.current;
    if (!element || !screenKey || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const animation = element.animate(
      [
        { opacity: 0, transform: fullBleed ? 'none' : 'translateY(8px)' },
        { opacity: 1, transform: 'translateY(0)' },
      ],
      { duration: 320, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
    return () => animation.cancel();
  }, [screenKey, fullBleed]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(window.localStorage.getItem('tmx-ui.sidebar.collapsed') === 'true');
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem('tmx-ui.sidebar.collapsed', String(next));
      return next;
    });
  };

  // The right slot defaults to the user menu; pages that need extra actions
  // (e.g. cloner editor) pass their own elements which we render BEFORE it.
  const right = (
    <>
      {topbarRight}
      <UserMenu />
    </>
  );
  return (
    <AuthGate>
      <OfferContextProvider>
        <a
          href="#conteudo-principal"
          className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition focus:translate-y-0"
        >
          Pular para o conteúdo
        </a>
        <div
          data-signal-shell={process.env.NEXT_PUBLIC_TMX_SIGNAL_PREVIEW === '1' ? '' : undefined}
          className="relative isolate flex h-dvh flex-col overflow-hidden"
        >
          {process.env.NEXT_PUBLIC_TMX_SIGNAL_PREVIEW === '1' && <AmbientBackground />}
          <Topbar
            breadcrumb={breadcrumb}
            right={right}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={toggleSidebar}
            onOpenMobileNavigation={() => setMobileNavOpen(true)}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            notificationCount={notificationCount}
            onOpenNotifications={onOpenNotifications}
          />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <Sidebar
              collapsed={sidebarCollapsed}
              mobileOpen={mobileNavOpen}
              onMobileOpenChange={setMobileNavOpen}
            />
            {fullBleed ? (
              <div
                ref={content}
                id="conteudo-principal"
                tabIndex={-1}
                className="min-w-0 flex-1 overflow-hidden"
              >
                {children}
              </div>
            ) : (
              <main
                id="conteudo-principal"
                tabIndex={-1}
                className="relative min-h-0 min-w-0 flex-1 scroll-smooth overflow-x-hidden overflow-y-auto overscroll-y-contain p-4 pb-8"
              >
                {process.env.NEXT_PUBLIC_TMX_SIGNAL_PREVIEW === '1' &&
                  process.env.NODE_ENV !== 'production' && (
                    <div
                      role="note"
                      className="mb-4 rounded-md border border-warning/30 bg-card px-4 py-2 text-xs text-warning"
                    >
                      Prévia local · dados reais · gravações e envios bloqueados. Fundo global e
                      novo visual das visões gerais em avaliação.
                    </div>
                  )}
                <div ref={content} className="tmx-route-content mx-auto w-full max-w-[1440px]">
                  {children}
                </div>
                <MicroFooter />
              </main>
            )}
          </div>
          <FinancialPrivacyMask />
          <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
          {fullBleed && <MicroFooter />}
        </div>
      </OfferContextProvider>
    </AuthGate>
  );
}
