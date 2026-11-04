'use client';
import { useAuth } from '@/lib/auth-context';
import { useTaskManagementAccess } from '@/lib/hooks/use-task-management-access';
import { NAVIGATION_IDS, hasNavigationAccess } from '@page-cloner/shared';
import { usePathname, useSearchParams } from 'next/navigation';
import type { ReactNode } from 'react';
import { resolveNavigation } from './navigation';

export function NavigationAccessGate({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { canManageTasks, pending } = useTaskManagementAccess();
  const path = usePathname();
  const search = useSearchParams();
  const item = resolveNavigation(path, search.toString())?.item;
  if (item?.requiresTaskManagement && pending)
    return <output>Validando acesso à gestão de tarefas…</output>;
  if (
    user?.role !== 'admin' &&
    item &&
    ((item.requiresTaskManagement && !canManageTasks) ||
      (item.id === 'operator-activity' && !user?.allowedTools?.includes('nav:operator-activity')) ||
      ((NAVIGATION_IDS as readonly string[]).includes(item.id) &&
        !hasNavigationAccess(user?.allowedTools, item.id)))
  ) {
    return (
      <section role="alert" className="glass-card rounded-xl border border-border bg-card p-6">
        <h1 className="text-xl font-semibold">Acesso não autorizado</h1>
        <p className="mt-2 text-muted-foreground">
          Esta aba não está liberada para sua conta. Solicite acesso ao administrador da sua
          empresa.
        </p>
      </section>
    );
  }
  return <>{children}</>;
}
