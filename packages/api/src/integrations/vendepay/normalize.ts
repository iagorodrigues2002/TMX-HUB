import { createHash } from 'node:crypto';
import { z } from 'zod';

const scalarId = z.union([
  z.string().trim().min(1).max(256),
  z.number().finite().transform(String),
]);
const looseRecord = z.record(z.string(), z.unknown());
const nullableText = z.string().max(512).nullish();
const nullableId = scalarId.nullish();
const nullableRecord = looseRecord.nullish();

export const VendepayWebhookSchema = z
  .object({
    id: nullableId,
    event: nullableText,
    type: nullableText,
    status: z.union([z.string().max(256), z.number().finite()]).nullish(),
    transaction_id: nullableId,
    order_id: nullableId,
    src: nullableText,
    data: nullableRecord,
    order: nullableRecord,
    transaction: nullableRecord,
    metadata: nullableRecord,
    customer: nullableRecord,
    buyer: nullableRecord,
  })
  .passthrough();

export type VendepayStatus =
  | 'paid'
  | 'pending'
  | 'refused'
  | 'refunded'
  | 'chargeback'
  | 'cancelled'
  | 'abandoned'
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
    [
      'paid',
      'approved',
      'approved_payment',
      'complete',
      'completed',
      'pago',
      'aprovado',
      'compra.aprovada',
    ].includes(status)
  )
    return 'paid';
  if (['pending', 'waiting', 'processing', 'pendente'].includes(status)) return 'pending';
  if (
    ['refused', 'declined', 'failed', 'recusado', 'recusada', 'falha', 'falhou'].includes(status) ||
    /(^|[._])(recusad[oa]|falha|falhou|failed|declined)$/.test(status)
  )
    return 'refused';
  if (['refunded', 'refund', 'reembolsado'].includes(status)) return 'refunded';
  if (['chargeback', 'dispute'].includes(status)) return 'chargeback';
  if (['cancelled', 'canceled', 'cancelado'].includes(status)) return 'cancelled';
  if (['carrinho.abandonado', 'carrinho_abandonado', 'abandonado'].includes(status))
    return 'abandoned';
  return 'unknown';
};

const statusAt = (
  value: Record<string, unknown>,
): { status: VendepayStatus; rawStatus?: string } => {
  const candidates = [
    'status',
    'transaction.status',
    'order.status',
    'data.status',
    'event',
    'type',
  ]
    .map((path) => textAt(value, [path]))
    .filter((candidate): candidate is string => Boolean(candidate));
  const recognized = candidates.find((candidate) => normalizeStatus(candidate) !== 'unknown');
  const rawStatus = recognized ?? candidates[0];
  return { status: normalizeStatus(rawStatus), ...(rawStatus ? { rawStatus } : {}) };
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

// Vendepay uses proprietary numeric currency codes on the moeda field.
// Cross-referenced against checkout.pais on live payloads (see analysis
// notes in DESIGN.md). Extend this map here as new codes are observed.
const VENDEPAY_CURRENCY_CODES: Record<string, string> = {
  '1': 'BRL',
  '2': 'USD',
  '3': 'EUR', // Áustria (AT), Alemanha, Portugal, etc.
  '4': 'CLP', // Chile: 9255 CLP ≈ $9.30 USD, matches front-product price
  '5': 'PEN', // Peru: payloads SLM usam moeda=5 (ex.: 33,70 PEN)
  '6': 'COP', // Colômbia: 31707 COP ≈ $7.90 USD
  '7': 'MXN', // México: 172.70 MXN ≈ $9.60 USD
  '8': 'CAD', // Canadá
  '10': 'GBP', // Reino Unido
  '13': 'SEK', // Suécia
};

// Full list of currencies we know how to quote against BRL. Used by the
// startup warmup and the backfill routine so read-time BRL totals work
// even for currencies that haven't appeared in a recent order.
export const SUPPORTED_CURRENCIES = Array.from(
  new Set(Object.values(VENDEPAY_CURRENCY_CODES).filter((c) => c !== 'BRL')),
);

const currencyCode = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  const normalized = raw.trim().toUpperCase();
  const mapped = VENDEPAY_CURRENCY_CODES[normalized];
  if (mapped) return mapped;
  return /^[A-Z]{3}$/.test(normalized) ? normalized : undefined;
};

const paymentMethodCode = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'pix'].includes(normalized)) return 'pix';
  if (['2', 'boleto'].includes(normalized)) return 'boleto';
  if (['3', 'card', 'credit_card', 'cartao', 'cartão'].includes(normalized)) return 'credit_card';
  if (['paypal', 'free_price', 'unknown'].includes(normalized)) return normalized;
  return 'unknown';
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
    'id',
    'checkoutId',
    'checkout.id',
  ]);
  const { status, rawStatus } = statusAt(payload);
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
  const buyerName = textAt(payload, [
    'buyer.name',
    'customer.name',
    'data.customer.name',
    'nomeComprador',
    'comprador.nome',
    'comprador.name',
  ]);
  const email = textAt(payload, [
    'buyer.email',
    'customer.email',
    'data.customer.email',
    'emailComprador',
    'comprador.email',
  ])?.toLowerCase();
  const phone = textAt(payload, [
    'buyer.phone',
    'customer.phone',
    'data.customer.phone',
    'telefoneComprador',
    'comprador.telefone',
    'comprador.phone',
  ]);
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
      'endereco.pais',
      'comprador.pais',
      'checkout.pais',
    ]),
  );
  const occurredAt = isoDate(
    get(payload, 'paid_at') ??
      get(payload, 'updated_at') ??
      get(payload, 'created_at') ??
      get(payload, 'data.created_at') ??
      get(payload, 'createdAt'),
    receivedAt,
  );
  const amountMinor = amountToMinor(
    get(payload, 'amount') ??
      get(payload, 'total') ??
      get(payload, 'value') ??
      get(payload, 'data.amount') ??
      get(payload, 'valorPago') ??
      get(payload, 'checkout.total') ??
      get(payload, 'checkout.valor'),
  );
  const currency = currencyCode(
    textAt(payload, ['currency', 'data.currency', 'order.currency', 'moeda', 'checkout.moeda']),
  );
  const trackingSrc = textAt(payload, [
    'src',
    'metadata.src',
    'data.src',
    'order.src',
    'urlParams.src',
  ]);
  const paymentMethod = paymentMethodCode(
    textAt(payload, [
      'payment_method',
      'paymentMethod',
      'transaction.payment_method',
      'data.payment_method',
      'order.payment_method',
      'metodoPagamento',
    ]),
  );
  const productId = textAt(payload, [
    'product.id',
    'data.product.id',
    'order.product_id',
    'product_id',
    'produtoId',
    'checkout.produtoId',
  ]);
  const productName = textAt(payload, [
    'product.name',
    'data.product.name',
    'order.product_name',
    'product_name',
    'nomeProduto',
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
          `urlParams.${key}`,
          ...(key.startsWith('utm_')
            ? [
                key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase()),
                `urlParams.${key.replace(/_([a-z])/g, (_, letter: string) =>
                  letter.toUpperCase(),
                )}`,
              ]
            : []),
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
