'use client';

import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Lock } from 'lucide-react';
import { canAccessTool, type ToolKey } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';

/**
 * Guard de página por ferramenta. Renderiza children quando o usuário tem
 * acesso. Caso contrário mostra 403 e redireciona pra /tools depois de 2s.
 * Admin e users sem allowedTools sempre passam.
 */
export function ToolGuard({
  tool,
  children,
}: {
  tool: ToolKey;
  children: ReactNode;
}) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowed = canAccessTool(user, tool);

  useEffect(() => {
    if (loading || !user) return;
    if (allowed) return;
    const t = setTimeout(() => router.replace('/tools'), 2000);
    return () => clearTimeout(t);
  }, [allowed, loading, user, router]);

  if (loading || !user) {
    return (
      <div className="grid min-h-[40vh] place-items-center text-white/45">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-md border border-rose-300/30 bg-rose-300/[0.06]">
          <Lock className="h-6 w-6 text-rose-300" />
        </div>
        <h1 className="text-[20px] font-semibold text-white">Acesso restrito</h1>
        <p className="mt-2 text-[13px] text-white/55">
          Sua conta não tem acesso à ferramenta <strong>{tool}</strong>. Solicite
          um novo convite a um administrador.
        </p>
        <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-white/35">
          Redirecionando para Tools…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
