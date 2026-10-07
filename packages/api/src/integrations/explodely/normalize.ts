import { createHash } from 'node:crypto';

export type ExplodelyEventKind =
  | 'sale'
  | 'refund'
  | 'chargeback'
  | 'rebill'
  | 'rebill_cancellation'
  | 'decline'
  | 'partial';

export type ExplodelyPayload = Record<string, unknown>;

export type ExplodelyEvent = {
  kind: ExplodelyEventKind;
  transactionId: string;
  externalId: string;
  mainOrderId: string | null;
  vendorId: string | null;
  sellerId: string | null;
  amount: string | null;
  currency: string | null;
  occurredAt: Date;
  buyer: Record<string, string>;
  product: Record<string, unknown>;
  source: Record<string, string>;
  trackingId: string | null;
  rawStatus: string;
};

export type ExplodelyNormalization =
  | { kind: 'processable'; event: ExplodelyEvent; diagnostics: string[] }
  | { kind: 'quarantined'; transactionId: string; diagnostics: string[] };

const text = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
};

const field = (payload: ExplodelyPayload, ...keys: string[]) =>
  text(...keys.map((key) => payload[key]));

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function eventKind(payload: ExplodelyPayload): ExplodelyEventKind | null {
  const raw = field(payload, 'type', 'event', 'event_type', 'eventType', 'status')
    ?.toLowerCase()
    .replace(/[\s-]+/g, '_');
  if (!raw) return null;
  if (raw === 'sale' && field(payload, 'rebill')?.toLowerCase() === 'yes') return 'rebill';
  if (raw === 'rebillcancel' || raw === 'rebill_cancel' || raw === 'rebill_cancellation') {
    return 'rebill_cancellation';
  }
  if (
    raw === 'sale' ||
    raw === 'refund' ||
    raw === 'chargeback' ||
    raw === 'rebill' ||
    raw === 'decline' ||
    raw === 'partial'
  ) {
    return raw;
  }
  return null;
}

function eventDate(payload: ExplodelyPayload, kind: ExplodelyEventKind, receivedAt: Date) {
  const numeric = field(
    payload,
    ...(kind === 'refund'
      ? ['refundtimestamp']
      : kind === 'rebill_cancellation'
        ? ['canceltimestamp']
        : ['saletimestamp', 'timestamp']),
  );
  if (numeric && /^\d{10,13}$/.test(numeric)) {
    const value = Number(numeric);
    const parsed = new Date(numeric.length === 10 ? value * 1_000 : value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  const formatted = field(
    payload,
    ...(kind === 'refund'
      ? ['refundtimedate']
      : kind === 'rebill_cancellation'
        ? ['canceltimedate']
        : ['saletimedate', 'occurred_at', 'created_at']),
  );
  if (formatted) {
    const parsed = new Date(formatted);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return receivedAt;
}

export function parseExplodelyPayload(
  rawBody: Buffer,
  contentType: string | undefined,
): ExplodelyPayload {
  const raw = rawBody.toString('utf8');
  if (contentType?.toLowerCase().includes('application/json')) {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('explodely_payload_must_be_object');
    }
    return parsed as ExplodelyPayload;
  }
  return Object.fromEntries(new URLSearchParams(raw).entries());
}

export function identifyExplodelyTransaction(payload: ExplodelyPayload, rawBody: Buffer) {
  const kind = eventKind(payload) ?? 'unknown';
  const orderId = field(payload, 'orderid', 'order_id', 'orderId', 'Order ID', 'transaction_id');
  const mainOrderId = field(
    payload,
    'mainorderid',
    'main_order_id',
    'mainOrderId',
    'Main Order ID',
  );
  const identity = orderId ?? mainOrderId ?? sha256(rawBody.toString('utf8'));
  return `${kind}:${identity}`;
}

export function normalizeExplodely(
  payload: ExplodelyPayload,
  rawBody: Buffer,
  receivedAt = new Date(),
): ExplodelyNormalization {
  const diagnostics: string[] = [];
  const kind = eventKind(payload);
  const receiptTransactionId = identifyExplodelyTransaction(payload, rawBody);
  if (!kind) {
    return {
      kind: 'quarantined',
      transactionId: receiptTransactionId,
      diagnostics: ['missing_or_unknown_event_type'],
    };
  }
  const orderId = field(payload, 'orderid', 'order_id', 'orderId', 'Order ID', 'transaction_id');
  const mainOrderId = field(
    payload,
    'mainorderid',
    'main_order_id',
    'mainOrderId',
    'Main Order ID',
  );
  const externalId = kind === 'rebill_cancellation' ? mainOrderId : orderId;
  if (!externalId && !['decline', 'partial'].includes(kind)) {
    return {
      kind: 'quarantined',
      transactionId: receiptTransactionId,
      diagnostics: ['missing_transaction_id'],
    };
  }
  if (!field(payload, 'currency', 'currency_code')) diagnostics.push('currency_not_provided');
  const trackingId = field(payload, 'tracking_id', 'trackingId', 'Tracking ID', 'custom1');
  const source: Record<string, string> = {};
  for (const key of [
    'affiliate',
    'custom1',
    'custom2',
    'custom3',
    'custom4',
    'custom5',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'gclid',
    'gbraid',
    'wbraid',
    'fbclid',
    '_fbc',
    '_fbp',
    'ttclid',
    '_ttp',
    'event_url',
    'referrer',
  ]) {
    const value = field(payload, key);
    if (value) source[key] = value;
  }
  const buyer = Object.fromEntries(
    [
      ['name', field(payload, 'customerName', 'customer_name', 'Customer Name')],
      ['email', field(payload, 'customerEmail', 'customer_email', 'Customer Email')],
      ['phone', field(payload, 'customerPhone', 'customer_phone', 'Customer Phone')],
      ['postalCode', field(payload, 'zipcode', 'zip_code', 'Zip Code')],
      ['country', field(payload, 'country', 'country_code', 'Country Code')],
      ['ip', field(payload, 'ipadd', 'ip_address', 'IP Address')],
    ].filter((entry): entry is [string, string] => Boolean(entry[1])),
  );
  const product = Object.fromEntries(
    [
      ['id', field(payload, 'productId', 'product_id', 'Product ID')],
      ['name', field(payload, 'productName', 'product_name', 'Product Name')],
      ['mainOrderId', mainOrderId],
      ['recurring', kind === 'rebill' ? true : null],
      ['orderBump', field(payload, 'obselected', 'order_bump_selected', 'Order Bump Selected')],
    ].filter((entry) => entry[1] !== null),
  );
  return {
    kind: 'processable',
    diagnostics,
    event: {
      kind,
      transactionId: receiptTransactionId,
      externalId: externalId ?? sha256(rawBody.toString('utf8')),
      mainOrderId,
      vendorId: field(payload, 'vendor_id', 'vendorId', 'vendorid', 'Vendor ID'),
      sellerId: field(payload, 'seller_id', 'sellerId', 'sellerid', 'Seller ID'),
      amount: field(payload, 'amount', 'Amount'),
      currency: field(payload, 'currency', 'currency_code')?.toUpperCase() ?? null,
      occurredAt: eventDate(payload, kind, receivedAt),
      buyer,
      product,
      source,
      trackingId,
      rawStatus: field(payload, 'type', 'event', 'event_type', 'status') ?? kind,
    },
  };
}

export function explodelyEventPlan(kind: ExplodelyEventKind) {
  const trackingEvent = {
    sale: 'Purchase',
    refund: 'Refund',
    chargeback: 'Chargeback',
    rebill: 'Purchase',
    rebill_cancellation: 'SubscriptionCancelled',
    decline: 'PaymentRefused',
    partial: 'CheckoutAbandoned',
  }[kind];
  if (kind === 'sale' || kind === 'rebill') {
    return {
      orderAction: 'upsert' as const,
      status: 'paid',
      trackingEvent,
      recurring: kind === 'rebill',
    };
  }
  if (kind === 'refund' || kind === 'chargeback') {
    return {
      orderAction: 'update' as const,
      status: kind === 'refund' ? 'refunded' : 'chargeback',
      trackingEvent,
      recurring: false,
    };
  }
  if (kind === 'rebill_cancellation') {
    return { orderAction: 'update' as const, status: 'cancelled', trackingEvent, recurring: false };
  }
  return { orderAction: 'none' as const, status: null, trackingEvent, recurring: false };
}

export function explodelyConnectionMatches(
  settings: Record<string, unknown>,
  event: Pick<ExplodelyEvent, 'vendorId' | 'sellerId'>,
) {
  const vendorId = text(settings.vendor_id, settings.vendorId);
  const sellerId = text(settings.seller_id, settings.sellerId);
  return Boolean(
    (event.vendorId && vendorId === event.vendorId) ||
      (event.sellerId && sellerId === event.sellerId),
  );
}

export function explodelyEventId(transactionId: string) {
  return `explodely:${sha256(transactionId)}`;
}

export function explodelyAmountMinor(amount: string | null, settings: Record<string, unknown>) {
  if (!amount) return null;
  const normalized = amount.trim().replace(',', '.');
  if (!/^-?\d+(?:\.\d+)?$/.test(normalized)) return null;
  if (settings.amount_unit === 'minor') return Math.abs(Math.trunc(Number(normalized)));
  const scale = Number.isInteger(settings.amount_scale) ? Number(settings.amount_scale) : 2;
  if (scale < 0 || scale > 6) return null;
  return Math.abs(Math.round(Number(normalized) * 10 ** scale));
}
