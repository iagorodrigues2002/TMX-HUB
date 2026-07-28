'use client';

import { AuthGate } from '@/components/auth/auth-gate';
import type { ReactNode } from 'react';
import { MicroFooter } from './micro-footer';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { UserMenu } from './user-menu';

interface HubShellProps {
  children: ReactNode;
  breadcrumb?: string[];
  topbarRight?: ReactNode;
  /** When true, the children control their own scroll/layout (e.g. the editor). */
  fullBleed?: boolean;
}

export function HubShell({ children, breadcrumb, topbarRight, fullBleed }: HubShellProps) {
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
      <a
        href="#conteudo-principal"
        className="fixed left-4 top-3 z-[100] -translate-y-20 rounded-lg bg-cyan-300 px-4 py-2 text-sm font-semibold text-[#031516] transition focus:translate-y-0"
      >
        Pular para o conteúdo
      </a>
      <div className="flex h-dvh flex-col overflow-hidden">
        <Topbar breadcrumb={breadcrumb} right={right} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          {fullBleed ? (
            <div id="conteudo-principal" className="min-w-0 flex-1 overflow-hidden">
              {children}
            </div>
          ) : (
            <main
              id="conteudo-principal"
              className="min-w-0 flex-1 scroll-smooth overflow-y-auto px-4 pb-28 pt-6 sm:px-6 md:px-8 md:py-10 lg:pb-12 xl:px-12"
            >
              <div className="mx-auto w-full max-w-[1440px]">{children}</div>
              <MicroFooter />
            </main>
          )}
        </div>
        {fullBleed && <MicroFooter />}
      </div>
    </AuthGate>
  );
}
