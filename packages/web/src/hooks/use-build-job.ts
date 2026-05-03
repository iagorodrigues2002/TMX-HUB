'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import type { BuildJob, BuildOptionsRequest } from '@page-cloner/shared';
import { apiClient } from '@/lib/api-client';

const BUILD_POLLING_STATES = new Set<BuildJob['status']>(['queued', 'building']);

export function useCreateBuild(jobId: string) {
  return useMutation<BuildJob, Error, BuildOptionsRequest>({
    mutationFn: (opts) => apiClient.createBuild(jobId, opts),
  });
}

export function useBuildJob(jobId: string | undefined, buildId: string | undefined) {
  return useQuery<BuildJob>({
    queryKey: ['clone', jobId, 'build', buildId],
    queryFn: ({ signal }) => apiClient.getBuild(jobId ?? '', buildId ?? '', signal),
    enabled: Boolean(jobId && buildId),
    refetchInterval: (query) => {
      const data = query.state.data;
      if (!data) return 1500;
      return BUILD_POLLING_STATES.has(data.status) ? 1500 : false;
    },
  });
}
