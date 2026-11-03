import {
  type ManagedTask,
  ManagedTaskSchema,
  type TaskCreate,
  TaskEditSchema,
  type TaskPerson,
  TaskPersonSchema,
  type TaskStatus,
} from '@page-cloner/shared';
import { z } from 'zod';
import { request } from './request';

export const taskApi = {
  async access() {
    return z
      .object({
        global: z.boolean(),
        companies: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
      })
      .parse(await request('/v1/tasks/access'));
  },
  async users(companyId: string) {
    return z
      .object({ users: z.array(z.object({ id: z.string(), name: z.string(), email: z.string() })) })
      .parse(await request(`/v1/tasks/users?${new URLSearchParams({ companyId })}`)).users;
  },
  async list(
    page: number,
    filters: { person: string; status: string; q: string; companyId?: string },
  ) {
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
        managementMode: z.enum(['clickup', 'native']).default('clickup'),
        page: z.number(),
        limit: z.number(),
        summary: counts,
        peopleSummary: z.array(counts.extend({ id: z.string() })),
      })
      .parse(await request(`/v1/tasks?${query}`));
  },
  async people(companyId?: string) {
    return z
      .object({ people: z.array(TaskPersonSchema) })
      .parse(
        await request(
          `/v1/tasks/people${companyId ? `?${new URLSearchParams({ companyId })}` : ''}`,
        ),
      ).people;
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
  async status(id: string, status: TaskStatus, key: string, revision?: number) {
    return request(`/v1/tasks/${encodeURIComponent(id)}/status`, {
      method: 'PATCH',
      body: { status, revision },
      headers: { 'Idempotency-Key': key },
    });
  },
  async edit(id: string, input: z.infer<typeof TaskEditSchema>, key: string): Promise<ManagedTask> {
    return ManagedTaskSchema.parse(
      await request(`/v1/tasks/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: TaskEditSchema.parse(input),
        headers: { 'Idempotency-Key': key },
      }),
    );
  },
  async history(id: string) {
    return z
      .object({
        events: z.array(
          z.object({
            event_id: z.string(),
            received_at: z.string(),
            body: z.object({
              actorId: z.string().optional(),
              action: z.string().optional(),
              task: ManagedTaskSchema,
            }),
          }),
        ),
      })
      .parse(await request(`/v1/tasks/${encodeURIComponent(id)}/history`)).events;
  },
  async savePerson(person: TaskPerson) {
    return TaskPersonSchema.parse(
      await request('/v1/tasks/people', { method: 'POST', body: person }),
    );
  },
};
