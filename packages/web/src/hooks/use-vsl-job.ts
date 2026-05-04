'use client';

import { useQuery } from '@tanstack/react-query';
import { apiClient, type VslJobView } from '@/lib/api-client';

const POLLING_STATES = new Set([
  'queued',
  'analyzing',
  'extracting',
  'downloading',
  'processing',
  'uploading',
]);

export function useVslJob(id: string | undefined) {
  return useQuery<VslJobView>({
    queryKey: ['vsl', id],
    queryFn: ({ signal }) => apiClient.getVslJob(id ?? '', signal),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 2000;
      return POLLING_STATES.has(data.status) ? 2000 : false;
    },
  });
}
