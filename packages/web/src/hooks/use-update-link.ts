'use client';

import { apiClient } from '@/lib/api-client';
import { getSessionGeneration } from '@/lib/session-data';
import type { Link, UpdateLinkRequest } from '@page-cloner/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { linksQueryKey } from './use-clone-links';

interface UpdateLinkVars {
  linkId: string;
  body: UpdateLinkRequest;
}

export function useUpdateLink(jobId: string) {
  const qc = useQueryClient();
  const key = linksQueryKey(jobId);
  const generation = getSessionGeneration();
  const isCurrentSession = () => generation === getSessionGeneration();

  return useMutation<Link, Error, UpdateLinkVars, { previous?: Link[] }>({
    mutationFn: ({ linkId, body }) => {
      if (!isCurrentSession()) throw new Error('Sessão alterada. Abra a página novamente.');
      return apiClient.updateLink(jobId, linkId, body);
    },
    onMutate: async ({ linkId, body }) => {
      if (!isCurrentSession()) return {};
      await qc.cancelQueries({ queryKey: key });
      if (!isCurrentSession()) return {};
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
      if (!isCurrentSession()) return;
      if (ctx?.previous) {
        qc.setQueryData(key, ctx.previous);
      }
    },
    onSuccess: (updated) => {
      if (!isCurrentSession()) return;
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
