'use client';

import { type ToolKey, canAccessTool } from '@/lib/api-client';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from '@/lib/motion-router';
import { Loader2, Lock } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';

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
      <div className="grid min-h-[40vh] place-items-center text-muted-foreground">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-md border border-danger/30 bg-danger/10">
          <Lock className="h-6 w-6 text-danger" />
        </div>
        <h1 className="text-[20px] font-semibold text-foreground">Acesso restrito</h1>
        <p className="mt-2 text-[13px] text-muted-foreground">
          Sua conta não tem acesso à ferramenta <strong>{tool}</strong>. Solicite um novo convite a
          um administrador.
        </p>
        <p className="mt-3 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
          Redirecionando para Tools…
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
