'use client';

import { hasNavigationAccess } from '@page-cloner/shared';
import { useQuery } from '@tanstack/react-query';
import { taskApi } from '../api-client/endpoints-tasks';
import { useAuth } from '../auth-context';

/** UI capability only: every task/call operation remains authorized by the API. */
export function useTaskManagementAccess() {
  const { user } = useAuth();
  const global = user?.role === 'admin';
  const enabled =
    Boolean(user) && !global && hasNavigationAccess(user?.allowedTools, 'task-management');
  const access = useQuery({
    queryKey: ['task-management-access', user?.id],
    queryFn: taskApi.access,
    enabled,
    retry: false,
    staleTime: 30_000,
    refetchInterval: (query) => (query.state.data && !query.state.error ? 60_000 : false),
  });
  return {
    canManageTasks:
      global ||
      (enabled &&
        !access.isError &&
        !!access.data &&
        (access.data.global || access.data.companies.length > 0)),
    pending: enabled && access.isPending,
  };
}
