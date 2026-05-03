'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Link, UpdateLinkRequest } from '@page-cloner/shared';
import { apiClient } from '@/lib/api-client';
import { linksQueryKey } from './use-clone-links';

interface UpdateLinkVars {
  linkId: string;
  body: UpdateLinkRequest;
}

export function useUpdateLink(jobId: string) {
  const qc = useQueryClient();
  const key = linksQueryKey(jobId);

  return useMutation<Link, Error, UpdateLinkVars, { previous?: Link[] }>({
    mutationFn: ({ linkId, body }) => apiClient.updateLink(jobId, linkId, body),
    onMutate: async ({ linkId, body }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<Link[]>(key);
      if (previous) {
        qc.setQueryData<Link[]>(
          key,
          previous.map((l) => (l.id === linkId ? { ...l, currentHref: body.currentHref } : l)),
        );
      }
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(key, ctx.previous);
      }
    },
    onSuccess: (updated) => {
      const current = qc.getQueryData<Link[]>(key);
      if (current) {
        qc.setQueryData<Link[]>(
          key,
          current.map((l) => (l.id === updated.id ? updated : l)),
        );
      }
    },
  });
}
