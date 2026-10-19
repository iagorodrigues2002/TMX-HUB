import { z } from 'zod';

export const ConnectionSchema = z.object({
  name: z.string().trim().min(1).max(80),
  app_id: z.string().trim().min(5).max(80),
  app_secret: z.string().trim().min(20).max(500),
  access_token: z.string().trim().min(40).max(4096),
});

export const AssignmentSchema = z.object({ offer_id: z.string().trim().min(1).nullable() });

export const ConnectionQuerySchema = z.object({
  connection_id: z.string().trim().min(1).optional(),
});

export const SyncSchema = z.object({ connection_id: z.string().trim().min(1) });

export const PaymentPushcutSchema = z.object({
  secret: z.string().trim().min(8).max(256).optional(),
  notification_name: z.string().trim().min(1).max(200),
  devices: z.array(z.string().trim().min(1).max(120)).max(20).default([]),
  enabled: z.boolean().default(true),
});

export function assertAdmin(req: { user?: { role: string } }): void {
  if (req.user?.role !== 'admin') {
    const error = new Error(
      'Apenas administradores podem acessar o controle de contas.',
    ) as Error & {
      statusCode?: number;
    };
    error.statusCode = 403;
    throw error;
  }
}

export function accountStatusLabel(status: number): string {
  if (status === 1) return 'active';
  if (status === 2) return 'disabled';
  if (status === 3) return 'unsettled';
  if ([100, 101, 202].includes(status)) return 'closed';
  return 'attention';
}

export function operationalState(
  status: number,
  activeCampaigns: number,
  spend30d: number,
): string {
  if (status === 2) return 'disabled';
  if (status === 3) return 'unsettled';
  if (status !== 1) return 'attention';
  if (activeCampaigns > 0 && spend30d > 0) return 'delivering';
  return 'idle';
}

export function healthScore(status: number, activeCampaigns: number, spend30d: number): number {
  if (status === 2 || [100, 101, 202].includes(status)) return 0;
  if (status === 3) return 20;
  if (status !== 1) return 35;
  if (activeCampaigns > 0 && spend30d > 0) return 100;
  if (activeCampaigns > 0) return 72;
  return 80;
}
