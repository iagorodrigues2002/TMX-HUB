'use client';

import { taskApi } from '@/lib/api-client/endpoints-tasks';
import { useAuth } from '@/lib/auth-context';
import { taskManagementHref } from '@/lib/task-dashboard';
import { useQuery } from '@tanstack/react-query';
import { Building2, CalendarDays, ListTodo } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CallsDashboard } from './calls-dashboard';
import { TaskDashboard } from './task-dashboard';
import styles from './task-dashboard.module.css';

export function TaskManagementPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const tab = searchParams.get('tab') === 'calls' ? 'calls' : 'tasks';
  const { user } = useAuth();
  const [companyId, setCompanyId] = useState('');
  const access = useQuery({
    queryKey: ['task-management-access', user?.id],
    queryFn: taskApi.access,
    enabled: !!user,
    retry: false,
  });
  const companies = access.data?.companies ?? [];
  useEffect(() => {
    if (!access.data?.global && companies[0] && !companies.some((c) => c.id === companyId))
      setCompanyId(companies[0].id);
  }, [access.data, companyId, companies]);
  if (access.isPending) return <output>Validando empresas autorizadas…</output>;
  if (access.isError)
    return (
      <p role="alert">
        Não foi possível autorizar a gestão de tarefas. Somente administradores da empresa ou da
        plataforma podem acessar.
      </p>
    );
  const allowed = !!access.data && (access.data.global || companies.length > 0);
  return (
    <div className="space-y-5">
      <div className={styles.contextBar} data-motion-panel>
        <nav aria-label="Áreas de gestão" className={styles.viewTabs}>
          {(
            [
              ['tasks', 'Tarefas', ListTodo],
              ['calls', 'Calls', CalendarDays],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              type="button"
              aria-pressed={tab === value}
              onClick={() =>
                router.push(taskManagementHref(searchParams.toString(), value), { scroll: false })
              }
              className={styles.viewTab}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
            </button>
          ))}
        </nav>
        <label className="flex min-w-0 flex-1 items-center gap-3 text-xs text-muted-foreground sm:max-w-md">
          <span className="flex shrink-0 items-center gap-2">
            <Building2 className="h-4 w-4" aria-hidden /> Empresa
          </span>
          <select
            aria-label="Empresa da gestão"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            className="min-h-11 min-w-0 w-full rounded-lg border border-border bg-background px-3 pr-10 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            {access.data?.global && (
              <option value="">Todas as empresas · inclui legado sem vínculo</option>
            )}
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div hidden={tab !== 'tasks'}>
        <TaskDashboard
          key={`tasks:${companyId}`}
          companyId={companyId || undefined}
          companyAccess={allowed}
        />
      </div>
      {tab === 'calls' && (
        <CallsDashboard
          key={`calls:${companyId}`}
          companyId={companyId || undefined}
          companyAccess={allowed}
        />
      )}
    </div>
  );
}
