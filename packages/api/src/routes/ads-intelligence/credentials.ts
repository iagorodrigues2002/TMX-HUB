import { z } from 'zod';

export const credentials = z.object({
  login: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(4096),
  dashboard_id: z.string().trim().min(1).max(128),
});

export const mapping = z.object({
  campaign_key: z.string().min(1).max(512),
  offer_id: z.string().min(1).max(128),
});

export const number = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;

export function metrics(row: Record<string, unknown> = {}) {
  return {
    spend: number(row.spend) === null ? null : number(row.spend)! / 100,
    impressions: number(row.impressions),
    clicks: number(row.inlineLinkClicks),
    video_views: number(row.videoViews3Seconds),
    ic: 0,
    front_sales: 0,
    upsell_sales: 0,
    revenue: 0,
  };
}

export type Metrics = ReturnType<typeof metrics>;

export function sum(a: Metrics, b: Metrics) {
  for (const key of ['spend', 'impressions', 'clicks', 'video_views'] as const)
    a[key] = a[key] === null || b[key] === null ? null : a[key]! + b[key]!;
  for (const key of ['ic', 'front_sales', 'upsell_sales', 'revenue'] as const) a[key] += b[key];
}

export function ratios(m: Metrics) {
  return {
    ...m,
    cpc: m.spend !== null && m.clicks ? m.spend / m.clicks : null,
    cpm: m.spend !== null && m.impressions ? (m.spend / m.impressions) * 1000 : null,
    ctr: m.clicks !== null && m.impressions ? (m.clicks / m.impressions) * 100 : null,
    hook_rate:
      m.video_views !== null && m.impressions ? (m.video_views / m.impressions) * 100 : null,
    roas: m.spend ? m.revenue / m.spend : null,
    roi: m.spend ? ((m.revenue - m.spend) / m.spend) * 100 : null,
  };
}
