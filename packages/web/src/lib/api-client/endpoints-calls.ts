import { type CallCreate, CallCreateSchema, ManagedCallSchema } from '@page-cloner/shared';
import { z } from 'zod';
import { request } from './request';

export const callApi = {
  async list(status: string, companyId?: string) {
    return z
      .object({
        calls: z.array(ManagedCallSchema),
        total: z.number(),
        managementMode: z.enum(['clickup', 'native']).default('clickup'),
      })
      .parse(
        await request(
          `/v1/calls?${new URLSearchParams({ status, ...(companyId ? { companyId } : {}) })}`,
        ),
      );
  },
  async save(input: CallCreate, key: string, existing?: { id: string; revision: number }) {
    const body = CallCreateSchema.parse(input);
    return ManagedCallSchema.parse(
      await request(existing ? `/v1/calls/${encodeURIComponent(existing.id)}` : '/v1/calls', {
        method: existing ? 'PUT' : 'POST',
        headers: { 'Idempotency-Key': key },
        body: existing ? { ...body, revision: existing.revision } : body,
      }),
    );
  },
  async status(id: string, revision: number, action: 'cancel' | 'complete', key: string) {
    return ManagedCallSchema.parse(
      await request(`/v1/calls/${encodeURIComponent(id)}/${action}`, {
        method: 'POST',
        body: { revision },
        headers: { 'Idempotency-Key': key },
      }),
    );
  },
};
