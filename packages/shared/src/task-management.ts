import { z } from 'zod';

export const TaskStatusSchema = z.enum(['pending', 'progress', 'done']);
export const TASK_SECTORS = [
  'Infraestrutura',
  'Tráfego',
  'Funil & Desenvolvimento',
  'Spy',
] as const;
export const TaskPersonSchema = z
  .object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(100),
    clickupId: z.string().regex(/^\d+$/).nullable(),
    discordId: z.string().regex(/^\d+$/).nullable(),
    userId: z.string().min(1).max(200).nullable().optional(),
  })
  .strict();
export const TaskCreateSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(10000).default(''),
    sector: z.enum(TASK_SECTORS),
    offer: z.string().trim().max(100).nullable(),
    assigneeIds: z
      .array(z.string().uuid())
      .min(1)
      .max(20)
      .refine((ids) => new Set(ids).size === ids.length),
    priority: z.enum(['urgent', 'high', 'normal', 'low']),
    dueAt: z.string().datetime({ offset: true }).nullable(),
  })
  .strict();
export const ManagedTaskSchema = z
  .object({
    id: z.string().uuid(),
    clickupId: z
      .string()
      .regex(/^[a-zA-Z0-9_-]+$/)
      .nullable(),
    discordMessageId: z.string().regex(/^\d+$/).nullable().default(null),
    discordChannelId: z.string().regex(/^\d+$/).nullable().default(null),
    title: z.string().min(1).max(200),
    description: z.string().max(10000),
    sector: z.string().min(1).max(100),
    offer: z.string().max(100).nullable(),
    assignees: z.array(TaskPersonSchema).max(20),
    status: TaskStatusSchema,
    priority: z.enum(['urgent', 'high', 'normal', 'low']),
    source: z.enum(['tmx', 'discord', 'clickup']),
    receivedAt: z.string().datetime({ offset: true }),
    assignedAt: z.string().datetime({ offset: true }).nullable(),
    assignmentReceivedAt: z.record(z.string().datetime({ offset: true })).default({}),
    startedAt: z.string().datetime({ offset: true }).nullable(),
    completedAt: z.string().datetime({ offset: true }).nullable(),
    dueAt: z.string().datetime({ offset: true }).nullable(),
    updatedAt: z.string().datetime({ offset: true }),
    syncState: z.enum(['queued', 'synced', 'failed']),
    discordState: z.enum(['pending', 'synced', 'failed']),
  })
  .strict();
export const TaskEventSchema = z
  .object({
    eventId: z.string().min(1).max(200),
    task: ManagedTaskSchema.omit({ id: true }).extend({ id: z.string().uuid().optional() }),
  })
  .strict();
export const TaskCommandSchema = z
  .object({
    id: z.string().uuid(),
    taskId: z.string().uuid(),
    action: z.enum(['create', 'status']),
    status: TaskStatusSchema.optional(),
    task: ManagedTaskSchema,
  })
  .strict();
export type ManagedTask = z.infer<typeof ManagedTaskSchema>;
export type TaskPerson = z.infer<typeof TaskPersonSchema>;
export type TaskCreate = z.infer<typeof TaskCreateSchema>;
export type TaskStatus = z.infer<typeof TaskStatusSchema>;
export type TaskCommand = z.infer<typeof TaskCommandSchema>;
