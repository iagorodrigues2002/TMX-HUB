import { z } from 'zod';

export const scalarId = z.union([
  z.string().trim().min(1).max(256),
  z.number().finite().transform(String),
]);

export const looseRecord = z.record(z.string(), z.unknown());

export const nullableText = z.string().max(512).nullish();

export const nullableId = scalarId.nullish();

export const nullableRecord = looseRecord.nullish();

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
  vendid?: string;
  amountMinor?: number;
  currency?: string;
  buyer: {
    name?: string;
    email?: string;
    phone?: string;
    country?: string;
    postalCode?: string;
  };
  paymentMethod?: string;
  product: { id?: string; name?: string; planId?: string; planName?: string };
  source: Record<string, string>;
  occurredAt: string;
}

export type VendepayNormalizeResult =
  | { kind: 'processable'; event: NormalizedVendepayEvent; dedupeKey: string }
  | { kind: 'quarantined'; reason: string; diagnostics: string[]; dedupeKey: string };

export const get = (value: Record<string, unknown>, path: string): unknown => {
  let current: unknown = value;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object' || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
};

export const textAt = (value: Record<string, unknown>, paths: string[]): string | undefined => {
  for (const path of paths) {
    const candidate = get(value, path);
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
    if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
  }
  return undefined;
};

export const textByNormalizedKey = (
  value: unknown,
  normalizedKeys: Set<string>,
  depth = 0,
): string | undefined => {
  if (!value || typeof value !== 'object' || depth > 8) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = textByNormalizedKey(item, normalizedKeys, depth + 1);
      if (nested) return nested;
    }
    return undefined;
  }
  for (const [key, candidate] of Object.entries(value as Record<string, unknown>)) {
    const normalizedKey = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedKeys.has(normalizedKey)) {
      if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
      if (typeof candidate === 'number' && Number.isFinite(candidate)) return String(candidate);
    }
    const nested = textByNormalizedKey(candidate, normalizedKeys, depth + 1);
    if (nested) return nested;
  }
  return undefined;
};

export const normalizeStatus = (raw = ''): VendepayStatus => {
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
      'completo',
      'completa',
      'concluido',
      'concluida',
      'finalizado',
      'finalizada',
      'success',
      'sucesso',
      'pago',
      'aprovado',
      'compra.aprovada',
      // Current Vendepay payloads may expose the sale status as its numeric
      // enum. The checkout API returns 6 for a completed/paid sale.
      '6',
    ].includes(status) ||
    /(^|[._])(paid|approved|aprovad[oa]|completed?|complet[oa]|concluid[oa]|finalizad[oa]|success|sucesso)$/.test(
      status,
    )
  )
    return 'paid';
  if (['pending', 'waiting', 'processing', 'pendente'].includes(status)) return 'pending';
  if (
    ['refused', 'declined', 'failed', 'recusado', 'recusada', 'falha', 'falhou'].includes(status) ||
    /(^|[._])(recusad[oa]|falha|falhou|failed|declined)$/.test(status)
  )
    return 'refused';
  if (['refunded', 'refund', 'reembolsado', 'reembolso'].includes(status)) return 'refunded';
  // VendePay's transaction ledger labels this lifecycle event simply as
  // "Charge" (with the human description "Taxa de chargeback"). Treat it
  // exactly like the explicit webhook spellings so the original order is
  // updated instead of remaining with an unknown status.
  if (['chargeback', 'charge', 'dispute'].includes(status)) return 'chargeback';
  if (['cancelled', 'canceled', 'cancelado'].includes(status)) return 'cancelled';
  if (['carrinho.abandonado', 'carrinho_abandonado', 'abandonado'].includes(status))
    return 'abandoned';
  return 'unknown';
};

export const statusAt = (
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
  // A lifecycle notification can retain the original transaction status
  // (`completed`) while carrying the actual transition in `event` or `type`
  // (`Charge` / `Reembolso`). Reversals must win over a generic paid status.
  const reversal = candidates.find((candidate) => {
    const status = normalizeStatus(candidate);
    return status === 'refunded' || status === 'chargeback';
  });
  const recognized =
    reversal ?? candidates.find((candidate) => normalizeStatus(candidate) !== 'unknown');
  const rawStatus = recognized ?? candidates[0];
  return { status: normalizeStatus(rawStatus), ...(rawStatus ? { rawStatus } : {}) };
};

export const amountToMinor = (raw: unknown): number | undefined => {
  if (typeof raw !== 'number' && typeof raw !== 'string') return undefined;
  const normalized = typeof raw === 'string' ? raw.trim().replace(',', '.') : String(raw);
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const [whole, decimals = ''] = normalized.split('.');
  const minor = Number(whole) * 100 + Number(decimals.padEnd(2, '0'));
  return Number.isSafeInteger(minor) ? minor : undefined;
};

export const isoDate = (raw: unknown, fallback: Date): string => {
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

export const countryCode = (raw: string | undefined): string | undefined => {
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
export const VENDEPAY_CURRENCY_CODES: Record<string, string> = {
  '1': 'BRL',
  '2': 'USD',
  '3': 'EUR', // Áustria (AT), Alemanha, Portugal, etc.
  '4': 'CLP', // Chile: 9255 CLP ≈ $9.30 USD, matches front-product price
  '5': 'PEN', // Peru: payloads SLM usam moeda=5 (ex.: 33,70 PEN)
  '6': 'COP', // Colômbia: 31707 COP ≈ $7.90 USD
  '7': 'MXN', // México: 172.70 MXN ≈ $9.60 USD
  '8': 'CAD', // Canadá
  '9': 'JPY', // Japão
  '10': 'GBP', // Reino Unido
  '11': 'DKK', // Dinamarca
  '12': 'NOK', // Noruega
  '13': 'SEK', // Suécia
  '14': 'PYG', // Paraguai
  '15': 'CHF', // Suíça
};

// Full list of currencies we know how to quote against BRL. Used by the
// startup warmup and the backfill routine so read-time BRL totals work
// even for currencies that haven't appeared in a recent order.
export const SUPPORTED_CURRENCIES = Array.from(
  new Set(Object.values(VENDEPAY_CURRENCY_CODES).filter((c) => c !== 'BRL')),
);

export const currencyCode = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  const normalized = raw.trim().toUpperCase();
  const mapped = VENDEPAY_CURRENCY_CODES[normalized];
  if (mapped) return mapped;
  return /^[A-Z]{3}$/.test(normalized) ? normalized : undefined;
};

export const paymentMethodCode = (raw: string | undefined): string | undefined => {
  if (!raw) return undefined;
  const normalized = raw.trim().toLowerCase();
  if (['1', 'pix'].includes(normalized)) return 'pix';
  if (['2', 'boleto'].includes(normalized)) return 'boleto';
  if (['3', 'card', 'credit_card', 'cartao', 'cartão'].includes(normalized)) return 'credit_card';
  if (['paypal', 'free_price', 'unknown'].includes(normalized)) return normalized;
  return 'unknown';
};
