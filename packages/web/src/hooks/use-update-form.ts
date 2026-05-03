'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { Form, UpdateFormRequest } from '@page-cloner/shared';
import { apiClient } from '@/lib/api-client';
import { formsQueryKey } from './use-clone-forms';

interface UpdateFormVars {
  formId: string;
  body: UpdateFormRequest;
}

export function useUpdateForm(jobId: string) {
  const qc = useQueryClient();
  const key = formsQueryKey(jobId);

  return useMutation<Form, Error, UpdateFormVars, { previous?: Form[] }>({
    mutationFn: ({ formId, body }) => apiClient.updateForm(jobId, formId, body),
    onMutate: async ({ formId, body }) => {
      await qc.cancelQueries({ queryKey: key });
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
      if (ctx?.previous) {
        qc.setQueryData(key, ctx.previous);
      }
    },
    onSuccess: (updated) => {
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
