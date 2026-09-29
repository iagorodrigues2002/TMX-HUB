'use client';

import { AuthGate } from '@/components/auth/auth-gate';
import type { ReactNode } from 'react';
import { EyeOff } from 'lucide-react';
import { MicroFooter } from './micro-footer';
import { Sidebar } from './sidebar';
import { Topbar } from './topbar';
import { UserMenu } from './user-menu';
import { usePrivacy } from '@/lib/privacy-context';

interface HubShellProps {
  children: ReactNode;
  breadcrumb?: string[];
  topbarRight?: ReactNode;
  /** When true, the children control their own scroll/layout (e.g. the editor). */
  fullBleed?: boolean;
}

export function HubShell({ children, breadcrumb, topbarRight, fullBleed }: HubShellProps) {
  const { isPrivate } = usePrivacy();
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
        <div className="relative flex flex-1 overflow-hidden" data-tmx-private={isPrivate ? 'on' : 'off'}>
          <Sidebar />
          {fullBleed ? (
            <div id="conteudo-principal" className="min-w-0 flex-1 overflow-hidden">
              {children}
            </div>
          ) : (
            <main
              id="conteudo-principal"
              className="min-w-0 flex-1 scroll-smooth overflow-x-hidden overflow-y-auto px-3 pb-28 pt-5 sm:px-6 sm:pt-6 md:px-8 md:py-10 lg:pb-12 xl:px-12"
            >
              <div className="mx-auto w-full max-w-[1440px]">{children}</div>
              <MicroFooter />
            </main>
          )}
          {isPrivate && (
            <div
              aria-live="polite"
              aria-label="Modo de privacidade ativo. Dados do TMX estão ocultos."
              className="tmx-privacy-shield absolute inset-0 z-20 flex items-center justify-center"
            >
              <div className="rounded-2xl border border-cyan-300/25 bg-[#07171d]/95 px-5 py-4 text-center shadow-[0_18px_60px_rgba(0,0,0,.5)] backdrop-blur-xl">
                <EyeOff className="mx-auto h-5 w-5 text-cyan-200" aria-hidden="true" />
                <p className="mt-2 text-sm font-semibold text-white">Dados ocultos</p>
                <p className="mt-1 text-xs text-white/60">Use o ícone de olho no topo para exibir novamente.</p>
              </div>
            </div>
          )}
        </div>
        {fullBleed && <MicroFooter />}
      </div>
    </AuthGate>
  );
}
