import { createHash } from 'node:crypto';
import { z } from 'zod';

const scalarId = z.union([
  z.string().trim().min(1).max(256),
  z.number().finite().transform(String),
]);
const looseRecord = z.record(z.string(), z.unknown());

export const VendepayWebhookSchema = z
  .object({
    id: scalarId.optional(),
    event: z.string().max(256).optional(),
    type: z.string().max(256).optional(),
    status: z.string().max(256).optional(),
    transaction_id: scalarId.optional(),
    order_id: scalarId.optional(),
    src: z.string().trim().max(512).optional(),
    data: looseRecord.optional(),
    order: looseRecord.optional(),
    transaction: looseRecord.optional(),
    metadata: looseRecord.optional(),
    customer: looseRecord.optional(),
    buyer: looseRecord.optional(),
  })
  .passthrough();

export type VendepayStatus =
  | 'paid'
  | 'pending'
  | 'refused'
  | 'refunded'
  | 'chargeback'
  | 'cancelled'
  | 'unknown';

export interface NormalizedVendepayEvent {
  transactionId: string;
  providerEventId?: string;
  status: VendepayStatus;
  rawStatus?: string;
  trackingSrc?: string;
  amountMinor?: number;
  currency?: string;
  buyer: { name?: string; email?: string; phone?: string; country?: string };
  paymentMethod?: string;
  product: { id?: string; name?: string; planId?: string; planName?: string };
  source: Record<string, string>;
  occurredAt: string;
}

export type VendepayNormalizeResult =
  | { kind: 'processable'; event: NormalizedVendepayEvent; dedupeKey: string }
  | { kind: 'quarantined'; reason: string; diagnostics: string[]; dedupeKey: string };

const get = (value: Record<string, unknown>, path: string): unknown => {
  let current: unknown = value;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

const textAt = (value: Record<string, unknown>, paths: string[]): string | undefined => {
  for (const path of paths) {
    const candidate = get(value, path);
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  }
  return undefined;
};

const normalizeStatus = (raw = ''): VendepayStatus => {
  const status = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[\s-]+/g, '_');
  if (
    ['paid', 'approved', 'approved_payment', 'complete', 'completed', 'pago', 'aprovado'].includes(
      status,
    )
  )
    return 'paid';
  if (['pending', 'waiting', 'processing', 'pendente'].includes(status)) return 'pending';
  if (['refused', 'declined', 'failed', 'recusado'].includes(status)) return 'refused';
  if (['refunded', 'refund', 'reembolsado'].includes(status)) return 'refunded';
  if (['chargeback', 'dispute'].includes(status)) return 'chargeback';
  if (['cancelled', 'canceled', 'cancelado'].includes(status)) return 'cancelled';
  return 'unknown';
};

const amountToMinor = (raw: unknown): number | undefined => {
  if (typeof raw !== 'number' && typeof raw !== 'string') return undefined;
  const normalized = typeof raw === 'string' ? raw.trim().replace(',', '.') : String(raw);
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const [whole, decimals = ''] = normalized.split('.');
  const minor = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : undefined;
};

const isoDate = (raw: unknown, fallback: Date): string => {
  if (typeof raw === 'number') {
    const date = new Date(raw < 10_000_000_000 ? raw * 1000 : raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (typeof raw === 'string') {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return fallback.toISOString();
};

const countryCode = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  const normalized = raw.trim().normalize('NFD').replace(/\p{M}/gu, '').toUpperCase();
  if (/^[A-Z]{2}$/.test(normalized)) return normalized;
  if (['BRASIL', 'BRAZIL'].includes(normalized)) return 'BR';
  if (['ESTADOS UNIDOS', 'UNITED STATES', 'USA'].includes(normalized)) return 'US';
  return undefined;
};

export function normalizeVendepay(raw: unknown, receivedAt = new Date()): VendepayNormalizeResult {
  const parsed = VendepayWebhookSchema.safeParse(raw);
  if (!parsed.success) {
    const key = createHash('sha256').update(JSON.stringify(raw)).digest('hex');
    return {
      kind: 'quarantined',
      reason: 'invalid_envelope',
      diagnostics: ['Envelope inválido'],
      dedupeKey: key,
    };
  }
  const payload = parsed.data;
  const transactionId = textAt(payload, [
    'transaction_id',
    'transaction.id',
    'order.transaction_id',
    'data.transaction_id',
    'data.order_id',
    'order_id',
  ]);
  const rawStatus = textAt(payload, [
    'status',
    'transaction.status',
    'order.status',
    'data.status',
    'event',
    'type',
  ]);
  const eventId = textAt(payload, ['event_id', 'data.event_id', 'webhook_id']);
  const fallbackKey = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  if (!transactionId) {
    return {
      kind: 'quarantined',
      reason: 'missing_transaction_id',
      diagnostics: ['Nenhum identificador transacional reconhecido'],
      dedupeKey: eventId ?? fallbackKey,
    };
  }
  const buyerName = textAt(payload, ['buyer.name', 'customer.name', 'data.customer.name']);
  const email = textAt(payload, [
    'buyer.email',
    'customer.email',
    'data.customer.email',
  ])?.toLowerCase();
  const phone = textAt(payload, ['buyer.phone', 'customer.phone', 'data.customer.phone']);
  const country = countryCode(
    textAt(payload, [
      'buyer.country',
      'buyer.address.country',
      'customer.country',
      'customer.country_code',
      'customer.address.country',
      'customer.address.country_code',
      'data.customer.country',
      'data.customer.country_code',
      'data.customer.address.country',
      'billing_address.country',
      'address.country',
    ]),
  );
  const status = normalizeStatus(rawStatus);
  const occurredAt = isoDate(
    get(payload, 'paid_at') ??
      get(payload, 'updated_at') ??
      get(payload, 'created_at') ??
      get(payload, 'data.created_at'),
    receivedAt,
  );
  const amountMinor = amountToMinor(
    get(payload, 'amount') ??
      get(payload, 'total') ??
      get(payload, 'value') ??
      get(payload, 'data.amount'),
  );
  const currency = textAt(payload, ['currency', 'data.currency', 'order.currency'])?.toUpperCase();
  const trackingSrc = textAt(payload, ['src', 'metadata.src', 'data.src', 'order.src']);
  const paymentMethod = textAt(payload, [
    'payment_method',
    'paymentMethod',
    'transaction.payment_method',
    'data.payment_method',
    'order.payment_method',
  ]);
  const productId = textAt(payload, [
    'product.id',
    'data.product.id',
    'order.product_id',
    'product_id',
  ]);
  const productName = textAt(payload, [
    'product.name',
    'data.product.name',
    'order.product_name',
    'product_name',
  ]);
  const planId = textAt(payload, ['offer.id', 'plan.id', 'data.offer.id', 'offer_id', 'plan_id']);
  const planName = textAt(payload, [
    'offer.name',
    'plan.name',
    'data.offer.name',
    'offer_name',
    'plan_name',
  ]);
  const sourceEntries = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'sck',
    'fbclid',
    '_fbp',
    '_fbc',
    'campaign_id',
    'campaign_name',
    'adset_id',
    'adset_name',
    'ad_id',
    'ad_name',
    'placement',
    'site_source_name',
  ] as const;
  const source = {
    ...Object.fromEntries(
      sourceEntries.flatMap((key) => {
        const value = textAt(payload, [
          key,
          `metadata.${key}`,
          `data.${key}`,
          `tracking.${key}`,
          `trackingParameters.${key}`,
        ]);
        return value ? [[key, value]] : [];
      }),
    ),
    ...(trackingSrc ? { src: trackingSrc } : {}),
  };
  const dedupeKey = eventId
    ? createHash('sha256').update(`event|${eventId}`).digest('hex')
    : createHash('sha256')
        .update(
          [
            'transaction',
            transactionId,
            status,
            amountMinor ?? '',
            currency ?? '',
            trackingSrc ?? '',
          ].join('|'),
        )
        .digest('hex');
  return {
    kind: 'processable',
    dedupeKey,
    event: {
      transactionId,
      ...(eventId ? { providerEventId: eventId } : {}),
      status,
      ...(rawStatus ? { rawStatus } : {}),
      ...(trackingSrc ? { trackingSrc } : {}),
      ...(amountMinor !== undefined ? { amountMinor } : {}),
      ...(currency ? { currency } : {}),
      buyer: {
        ...(buyerName ? { name: buyerName } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(country ? { country } : {}),
      },
      ...(paymentMethod ? { paymentMethod } : {}),
      product: {
        ...(productId ? { id: productId } : {}),
        ...(productName ? { name: productName } : {}),
        ...(planId ? { planId } : {}),
        ...(planName ? { planName } : {}),
      },
      source,
      occurredAt,
    },
  };
}
