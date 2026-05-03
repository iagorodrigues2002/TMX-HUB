'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, type CloneJob } from '@/lib/api-client';

const POLLING_STATES = new Set(['queued', 'rendering', 'sanitizing', 'resolving_assets']);

export function useCloneJob(id: string | undefined) {
  return useQuery<CloneJob>({
    queryKey: ['clone', id],
    queryFn: ({ signal }) => apiClient.getClone(id ?? '', signal),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 1500;
      return POLLING_STATES.has(data.status) ? 1500 : false;
    },
  });
}

export function cloneQueryKey(id: string): readonly unknown[] {
  return ['clone', id];
}
