'use client';

import { useQuery } from '@tanstack/react-query';
import type { Form } from '@page-cloner/shared';
import { apiClient } from '@/lib/api-client';

export function useCloneForms(id: string | undefined, enabled = true) {
  return useQuery<Form[]>({
    queryKey: ['clone', id, 'forms'],
    queryFn: async ({ signal }) => {
      if (!id) return [];
      const out: Form[] = [];
      let cursor: string | undefined;
      do {
        const page = await apiClient.getCloneForms(id, cursor, 200, signal);
        out.push(...page.data);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      return out;
    },
    enabled: Boolean(id) && enabled,
    staleTime: 30_000,
  });
}

export function formsQueryKey(id: string): readonly unknown[] {
  return ['clone', id, 'forms'];
}
