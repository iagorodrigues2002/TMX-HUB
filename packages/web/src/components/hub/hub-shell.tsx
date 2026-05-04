'use client';

import type { ReactNode } from 'react';
import { AuthGate } from '@/components/auth/auth-gate';
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
      <div className={fullBleed ? 'flex h-screen flex-col' : 'flex min-h-screen flex-col'}>
        <Topbar breadcrumb={breadcrumb} right={right} />
        <div className="flex flex-1 overflow-hidden">
          <Sidebar />
          {fullBleed ? (
            <div className="flex-1 overflow-hidden">{children}</div>
          ) : (
            <main className="flex-1 overflow-y-auto px-6 py-8 md:px-10 md:py-12">
              <div className="mx-auto w-full max-w-6xl">{children}</div>
            </main>
          )}
        </div>
        <MicroFooter />
      </div>
    </AuthGate>
  );
}
