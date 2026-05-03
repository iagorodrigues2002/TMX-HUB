'use client';

import { useQuery } from '@tanstack/react-query';
import type { Link } from '@page-cloner/shared';
import { apiClient } from '@/lib/api-client';

export function useCloneLinks(id: string | undefined, enabled = true) {
  return useQuery<Link[]>({
    queryKey: ['clone', id, 'links'],
    queryFn: async ({ signal }) => {
      if (!id) return [];
      const out: Link[] = [];
      let cursor: string | undefined;
      do {
        const page = await apiClient.getCloneLinks(id, cursor, 200, signal);
        out.push(...page.data);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return out;
    },
    enabled: Boolean(id) && enabled,
    staleTime: 30_000,
  });
}

export function linksQueryKey(id: string): readonly unknown[] {
  return ['clone', id, 'links'];
}
