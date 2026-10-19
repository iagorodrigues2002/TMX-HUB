import { createHash } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../env.js';
import { zodToProblem } from '../../lib/problem.js';
import { saoPauloParts } from '../../services/intraday-store.js';
import { saoPauloDayRange } from '../../services/utmify-sync.js';

export const PaginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(25),
});

export const TrackingDateSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export const TrackingPaginationSchema = PaginationSchema.merge(TrackingDateSchema);

export const VendepaySigningSecretSchema = z.object({
  signing_secret: z.string().trim().min(16).max(4096),
});

export const VendepayConnectionSchema = z.object({
  name: z.string().trim().min(2).max(120),
});

export const VendepayConnectionUpdateSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  enabled: z.boolean().optional(),
});

export const GatewayConnectionSchema = z.object({
  provider: z.enum(['paysight', 'explodely']),
  name: z.string().trim().min(2).max(120),
  api_key: z.string().trim().min(8).max(4096).optional(),
  signing_secret: z.string().trim().min(8).max(4096).optional(),
  product_id: z.string().trim().min(1).max(256).optional(),
  vendor_id: z.string().trim().min(1).max(256).optional(),
  seller_id: z.string().trim().min(1).max(256).optional(),
  currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/)
    .optional(),
  amount_unit: z.enum(['decimal', 'minor']).default('decimal'),
  amount_scale: z.number().int().min(0).max(6).default(2),
  environment: z.enum(['sandbox', 'production']).default('production'),
});

export const GatewayConnectionUpdateSchema = GatewayConnectionSchema.partial().omit({
  provider: true,
});

export const UtmifyPixelSchema = z.object({
  pixel_id: z
    .string()
    .trim()
    .regex(/^[a-f0-9]{24}$/i, 'Use o ID de 24 caracteres exibido no Pixel da UTMify.'),
});

export const HealthAlertActionSchema = z.object({
  action: z.enum(['acknowledge', 'resolve']),
});

export type PaginationQuery = {
  page?: string | number;
  per_page?: string | number;
  date?: string;
  from?: string;
  to?: string;
};

export type TrackingPeriodQuery = { date?: string; from?: string; to?: string };

export const databaseUnavailable = {
  error: 'tracking_database_unavailable',
  detail: 'A infraestrutura de tracking está temporariamente indisponível.',
};

// Mirrors Vendepay's "Taxas Mercado Global" card so net revenue is sensible
// before anyone configures per-offer fees in tracking_fee_settings.
export const DEFAULT_FEE_SETTINGS = {
  vendepay_fee_pct: '9.9',
  extra_fee_minor: '149',
  extra_fee_currency: 'USD',
  reserve_pct: '6.9',
  reserve_days: 90,
  payout_days: 5,
};

export const FeeSettingsSchema = z.object({
  vendepay_fee_pct: z.coerce.number().min(0).max(100),
  extra_fee_minor: z.coerce.number().int().min(0),
  extra_fee_currency: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{3}$/, 'Use o código de 3 letras da moeda (ex.: USD, BRL).'),
  reserve_pct: z.coerce.number().min(0).max(100),
  reserve_days: z.coerce.number().int().min(0).max(3650),
  payout_days: z.coerce.number().int().min(0).max(365),
});

export const webhookUrl = (token: string) =>
  `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/webhooks/vendepay?token=${token}`;

export const gatewayWebhookUrl = (provider: string, token: string) =>
  `${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/webhooks/${provider}${
    provider === 'explodely' ? '' : `?token=${token}`
  }`;

export const installCode = (publicKey: string) =>
  `<script async src="${env.TRACKING_PUBLIC_BASE_URL.replace(/\/$/, '')}/v1/track/t.js?key=${publicKey}"></script>`;

export const tokenHash = (token: string) => createHash('sha256').update(token).digest('hex');

export function parsePagination(query: PaginationQuery) {
  const parsed = TrackingPaginationSchema.safeParse(query);
  if (!parsed.success) throw zodToProblem(parsed.error);
  return {
    ...parsed.data,
    offset: (parsed.data.page - 1) * parsed.data.per_page,
  };
}

export function parseTrackingDate(query: TrackingPeriodQuery) {
  const parsed = TrackingDateSchema.safeParse(query);
  if (!parsed.success) throw zodToProblem(parsed.error);
  const now = new Date();
  const today = saoPauloParts(now).date;
  const startDate = parsed.data.from ?? parsed.data.date ?? parsed.data.to ?? today;
  const endDate = parsed.data.to ?? parsed.data.date ?? parsed.data.from ?? today;
  if (startDate > endDate) {
    throw zodToProblem(
      new z.ZodError([
        {
          code: 'custom',
          path: ['from'],
          message: 'A data inicial não pode ser posterior à data final.',
        },
      ]),
    );
  }
  if (endDate > today) {
    throw zodToProblem(
      new z.ZodError([
        {
          code: 'custom',
          path: ['to'],
          message: 'O período não pode terminar no futuro.',
        },
      ]),
    );
  }
  const startRange = saoPauloDayRange(startDate, now);
  const endRange = saoPauloDayRange(endDate, now);
  return {
    date: startDate === endDate ? startDate : `${startDate}:${endDate}`,
    from_date: startDate,
    to_date: endDate,
    from: new Date(startRange.from),
    to: new Date(endRange.to),
  };
}

export function pagination(page: number, perPage: number, total: number) {
  return {
    page,
    per_page: perPage,
    total,
    total_pages: Math.ceil(total / perPage),
  };
}
