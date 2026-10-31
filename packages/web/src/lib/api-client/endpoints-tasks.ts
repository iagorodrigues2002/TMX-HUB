import {
  type ManagedTask,
  ManagedTaskSchema,
  type TaskCreate,
  type TaskPerson,
  TaskPersonSchema,
  type TaskStatus,
} from '@page-cloner/shared';
import { z } from 'zod';
import { request } from './request';

export const taskApi = {
  async list(page: number, filters: { person: string; status: string; q: string }) {
    const counts = z.object({
      open: z.number(),
      progress: z.number(),
      done: z.number(),
      overdue: z.number(),
    });
    const query = new URLSearchParams({ page: String(page), limit: '50', ...filters });
    return z
      .object({
        tasks: z.array(ManagedTaskSchema),
        total: z.number(),
        configured: z.boolean(),
        page: z.number(),
        limit: z.number(),
        summary: counts,
        peopleSummary: z.array(counts.extend({ id: z.string() })),
      })
      .parse(await request(`/v1/tasks?${query}`));
  },
  async people() {
    return z.object({ people: z.array(TaskPersonSchema) }).parse(await request('/v1/tasks/people'))
      .people;
  },
  async create(input: TaskCreate, key: string): Promise<ManagedTask> {
    return ManagedTaskSchema.parse(
      await request('/v1/tasks', {
        method: 'POST',
        body: input,
        headers: { 'Idempotency-Key': key },
      }),
    );
  },
  async status(id: string, status: TaskStatus, key: string) {
    return request(`/v1/tasks/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: { status },
      headers: { 'Idempotency-Key': key },
    });
  },
  async savePerson(person: TaskPerson) {
    return TaskPersonSchema.parse(
      await request('/v1/tasks/people', { method: 'POST', body: person }),
    );
  },
};
