'use client';

import { AuthGate } from '@/components/auth/auth-gate';
import { type ReactNode, Suspense, useState } from 'react';
import { AmbientBackground } from './ambient-background';
import { CommandPalette } from './command-palette';
import { FinancialPrivacyMask } from './financial-privacy-mask';
import { MicroFooter } from './micro-footer';
import { NavigationAccessGate } from './navigation-access-gate';
import { NotificationCenter } from './notification-center';
import { OfferContextProvider } from './offer-context-switcher';
import motionStyles from './route-motion.module.css';
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(true);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [notificationCenterOpen, setNotificationCenterOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => !current);
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
          <AmbientBackground />
          <Topbar
            breadcrumb={breadcrumb}
            right={right}
            sidebarCollapsed={sidebarCollapsed}
            onToggleSidebar={toggleSidebar}
            onOpenMobileNavigation={() => setMobileNavOpen(true)}
            onOpenCommandPalette={() => setCommandPaletteOpen(true)}
            notificationCount={notificationCount ?? unreadCount}
            onOpenNotifications={onOpenNotifications ?? (() => setNotificationCenterOpen(true))}
          />
          <div
            className="tmx-workspace relative flex min-h-0 flex-1 overflow-hidden"
            onPointerDownCapture={(event) => {
              if (event.target instanceof Element && !event.target.closest('.tmx-sidebar'))
                setSidebarCollapsed(true);
            }}
          >
            <Sidebar
              collapsed={sidebarCollapsed}
              onCollapse={() => setSidebarCollapsed(true)}
              mobileOpen={mobileNavOpen}
              onMobileOpenChange={setMobileNavOpen}
            />
            <div className="tmx-nav-scrim" aria-hidden="true" />
            {fullBleed ? (
              <div
                id="conteudo-principal"
                tabIndex={-1}
                data-motion-coordinated="true"
                className={`min-w-0 flex-1 overflow-hidden ${motionStyles.coordinated}`}
              >
                <Suspense fallback={null}>
                  <NavigationAccessGate>{children}</NavigationAccessGate>
                </Suspense>
              </div>
            ) : (
              <main
                id="conteudo-principal"
                tabIndex={-1}
                className="relative min-h-0 min-w-0 flex-1 scroll-smooth overflow-x-hidden overflow-y-auto overscroll-y-contain p-4 pb-8"
              >
                {process.env.NEXT_PUBLIC_TMX_SIGNAL_PREVIEW === '1' &&
                  (process.env.NODE_ENV !== 'production' ||
                    process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic' ||
                    process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'live-copy') && (
                    <div
                      role="note"
                      className="mb-4 rounded-md border border-warning/30 bg-card px-4 py-2 text-xs text-warning"
                    >
                      {process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'synthetic'
                        ? `Homologação local · base live ${process.env.NEXT_PUBLIC_TMX_LOCAL_BASE ?? 'não conferida'} · dados sintéticos · nenhuma gravação em produção.`
                        : process.env.NEXT_PUBLIC_TMX_LOCAL_PREVIEW_KIND === 'live-copy'
                          ? `Homologação isolada · cópia do live · base ${process.env.NEXT_PUBLIC_TMX_LOCAL_BASE ?? 'não conferida'} · alterações somente locais e envios externos bloqueados.`
                          : 'Prévia local · dados reais · gravações e envios bloqueados. Fundo global e novo visual das visões gerais em avaliação.'}
                    </div>
                  )}
                <div
                  data-motion-coordinated="true"
                  className={`tmx-route-content mx-auto w-full max-w-[1440px] ${motionStyles.coordinated}`}
                >
                  <Suspense fallback={null}>
                    <NavigationAccessGate>{children}</NavigationAccessGate>
                  </Suspense>
                </div>
                <MicroFooter />
              </main>
            )}
          </div>
          <FinancialPrivacyMask />
          <CommandPalette open={commandPaletteOpen} onOpenChange={setCommandPaletteOpen} />
          <NotificationCenter
            open={notificationCenterOpen}
            onOpenChange={setNotificationCenterOpen}
            onUnreadCountChange={setUnreadCount}
          />
          {fullBleed && <MicroFooter floating />}
        </div>
      </OfferContextProvider>
    </AuthGate>
  );
}
