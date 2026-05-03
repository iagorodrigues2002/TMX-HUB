'use client';

import type { ReactNode } from 'react';
import { MicroFooter } from './micro-footer';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';

interface HubShellProps {
  children: ReactNode;
  breadcrumb?: string[];
  topbarRight?: ReactNode;
  /** When true, the children control their own scroll/layout (e.g. the editor). */
  fullBleed?: boolean;
}

export function HubShell({ children, breadcrumb, topbarRight, fullBleed }: HubShellProps) {
  return (
    <div className={fullBleed ? 'flex h-screen flex-col' : 'flex min-h-screen flex-col'}>
      <Topbar breadcrumb={breadcrumb} right={topbarRight} />
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
  );
}
