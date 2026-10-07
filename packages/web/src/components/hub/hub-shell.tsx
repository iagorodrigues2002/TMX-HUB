'use client';

import { AuthGate } from '@/components/auth/auth-gate';
import { type ReactNode, useEffect, useState } from 'react';
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
        <div className="flex h-dvh flex-col overflow-hidden">
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
          <div className="flex flex-1 overflow-hidden">
            <Sidebar
              collapsed={sidebarCollapsed}
              mobileOpen={mobileNavOpen}
              onMobileOpenChange={setMobileNavOpen}
            />
            {fullBleed ? (
              <div id="conteudo-principal" className="min-w-0 flex-1 overflow-hidden">
                {children}
              </div>
            ) : (
              <main
                id="conteudo-principal"
                className="min-w-0 flex-1 scroll-smooth overflow-x-hidden overflow-y-auto p-4 pb-8"
              >
                <div className="mx-auto w-full max-w-[1440px]">{children}</div>
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
