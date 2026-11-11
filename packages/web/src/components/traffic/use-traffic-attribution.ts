'use client';

import { request } from '@/lib/api-client/request';
import { useAuth } from '@/lib/auth-context';
import type { DateRange } from '@/lib/date-range';
import { useQuery } from '@tanstack/react-query';
import { trafficAttributionResponse } from './traffic-attribution-model';

export function useTrafficAttribution(range: DateRange, enabled: boolean) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['traffic-attribution', user?.id, range.from, range.to],
    queryFn: async ({ signal }) =>
      trafficAttributionResponse.parse(
        await request(
          `/v1/meta-control/traffic/attribution?${new URLSearchParams({ from: range.from, to: range.to })}`,
          { signal },
        ),
      ),
    enabled: !!user && enabled,
    staleTime: 60000,
    refetchInterval: 60000,
    retry: false,
  });
}
