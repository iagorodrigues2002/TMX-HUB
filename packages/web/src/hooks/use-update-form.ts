'use client';

import { apiClient } from '@/lib/api-client';
import { getSessionGeneration } from '@/lib/session-data';
import type { Form, UpdateFormRequest } from '@page-cloner/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { formsQueryKey } from './use-clone-forms';

interface UpdateFormVars {
  formId: string;
  body: UpdateFormRequest;
}

export function useUpdateForm(jobId: string) {
  const qc = useQueryClient();
  const key = formsQueryKey(jobId);
  const generation = getSessionGeneration();
  const isCurrentSession = () => generation === getSessionGeneration();

  return useMutation<Form, Error, UpdateFormVars, { previous?: Form[] }>({
    mutationFn: ({ formId, body }) => {
      if (!isCurrentSession()) throw new Error('Sessão alterada. Abra a página novamente.');
      return apiClient.updateForm(jobId, formId, body);
    },
    onMutate: async ({ formId, body }) => {
      if (!isCurrentSession()) return {};
      await qc.cancelQueries({ queryKey: key });
      if (!isCurrentSession()) return {};
      const previous = qc.getQueryData<Form[]>(key);
      if (previous) {
        qc.setQueryData<Form[]>(
          key,
          previous.map((f) =>
            f.id === formId
              ? {
                  ...f,
                  mode: body.mode ?? f.mode,
                  currentAction: body.currentAction ?? f.currentAction,
                  redirectTo: body.redirectTo !== undefined ? body.redirectTo : f.redirectTo,
                }
              : f,
          ),
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
      const current = qc.getQueryData<Form[]>(key);
      if (current) {
        qc.setQueryData<Form[]>(
          key,
          current.map((f) => (f.id === updated.id ? updated : f)),
        );
      }
    },
  });
}
