import { z } from 'zod';
import { TaskPersonSchema } from './task-management.js';

export const CallCreateSchema = z
  .object({
    title: z.string().trim().min(3).max(200),
    description: z.string().trim().max(5000).default(''),
    message: z.string().trim().max(1000).default(''),
    startsAt: z.string().datetime({ offset: true }),
    durationMinutes: z.number().int().min(15).max(480).default(60),
    meetingUrl: z
      .string()
      .url()
      .max(2000)
      .refine((v) => {
        const u = new URL(v);
        return u.protocol === 'https:' && !u.username && !u.password;
      }, 'Use um link HTTPS sem credenciais.'),
    participantIds: z
      .array(z.string().uuid())
      .min(1)
      .max(30)
      .refine((v) => new Set(v).size === v.length),
    reminderMinutes: z
      .array(z.number().int().min(0).max(1440))
      .min(1)
      .max(10)
      .default([30, 5, 0])
      .refine((v) => new Set(v).size === v.length),
  })
  .strict();
export const ManagedCallSchema = CallCreateSchema.omit({ participantIds: true }).extend({
  id: z.string().uuid(),
  participants: z.array(TaskPersonSchema),
  revision: z.number().int().min(1),
  status: z.enum(['scheduled', 'completed', 'cancelled']),
  clickupId: z.string().nullable(),
  discordMessageId: z.string().nullable(),
  discordChannelId: z.string().nullable(),
  syncState: z.enum(['queued', 'synced', 'failed']),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
});
export type CallCreate = z.infer<typeof CallCreateSchema>;
export type ManagedCall = z.infer<typeof ManagedCallSchema>;

// Old reminders are never replayed as a burst after an outage.
export function callReminderIsDue(startsAt: string, minutes: number, now: number) {
  const due = Date.parse(startsAt) - minutes * 60000;
  return due <= now && now - due <= 120000;
}
