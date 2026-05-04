'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, type FunnelJobView } from '@/lib/api-client';

const POLLING_STATES = new Set(['queued', 'crawling', 'packaging', 'uploading']);

export function useFunnelJob(id: string | undefined) {
  return useQuery<FunnelJobView>({
    queryKey: ['funnel', id],
    queryFn: ({ signal }) => apiClient.getFunnelJob(id ?? '', signal),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2_000;
      return POLLING_STATES.has(data.status) ? 2_000 : false;
    },
  });
}
