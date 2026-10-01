import { createHash } from 'node:crypto';

export type PaysightStatus =
  | 'paid'
  | 'pending'
  | 'refused'
  | 'refunded'
  | 'chargeback'
  | 'cancelled'
  | 'abandoned'
  | 'unknown';

export type PaysightEvent = {
  transactionId: string;
  providerEventId?: string;
  status: PaysightStatus;
  rawStatus?: string;
  trackingSrc?: string;
  amountMinor?: number;
  currency?: string;
  buyer: { name?: string; email?: string; phone?: string; country?: string; postalCode?: string };
  paymentMethod?: string;
  product: { id?: string; name?: string; planId?: string; planName?: string };
  source: Record<string, string>;
  occurredAt: string;
};

type Result =
  | { kind: 'processable'; event: PaysightEvent; dedupeKey: string }
  | { kind: 'quarantined'; reason: string; diagnostics: string[]; dedupeKey: string };

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const text = (...values: unknown[]) => {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
};

const status = (value?: string): PaysightStatus => {
  const normalized = (value ?? '').toLowerCase().replace(/[\s.-]+/g, '_');
  if (/(paid|approved|captured|complete|success|succeeded|settled)/.test(normalized)) return 'paid';
  if (/(refund|refunded)/.test(normalized)) return 'refunded';
  if (/(chargeback|dispute)/.test(normalized)) return 'chargeback';
  if (/(cancel|void)/.test(normalized)) return 'cancelled';
  if (/(abandon|expired)/.test(normalized)) return 'abandoned';
  if (/(declin|refus|fail|error)/.test(normalized)) return 'refused';
  if (/(pending|authoriz|process|created)/.test(normalized)) return 'pending';
  return 'unknown';
};

const minor = (value: unknown): number | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n * 100) : undefined;
};

const date = (value: unknown) => {
  const candidate = typeof value === 'number' && value < 10_000_000_000 ? value * 1000 : value;
  const parsed = new Date(candidate as string | number | Date);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
};

// Paysight's event envelope can differ between Widget, billing and subscription
// notifications. Keep this intentionally permissive; anything without a stable
// transaction identifier is quarantined instead of creating an untraceable sale.
export function normalizePaysight(payload: unknown): Result {
  const root = object(payload);
  const data = object(root.data);
  const transaction = object(root.transaction);
  const payment = object(root.payment);
  const customer = object(root.customer);
  const metadata = object(root.metadata);
  const sourceData = object(data.data);
  const transactionId = text(
    root.transaction_id, root.transactionId, root.payment_id, root.paymentId,
    data.transaction_id, data.transactionId, data.payment_id, data.paymentId,
    transaction.id, payment.id,
  );
  const providerEventId = text(root.event_id, root.eventId, root.id, data.event_id, data.id);
  const rawStatus = text(root.status, root.event, root.type, data.status, transaction.status, payment.status);
  const dedupeKey = providerEventId ?? transactionId ?? createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  if (!transactionId) {
    return { kind: 'quarantined', reason: 'missing_transaction_id', diagnostics: ['O webhook não contém transaction_id/payment_id estável.'], dedupeKey };
  }
  const custom = { ...metadata, ...sourceData, ...object(data.metadata) };
  const source: Record<string, string> = {};
  for (const key of ['src', 'sessionId', 'partnerSession', 'clickId', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'wbraid', 'gbraid', 'fbclid', 'ttclid']) {
    const value = text(custom[key], root[key], data[key]);
    if (value) source[key] = value;
  }
  return {
    kind: 'processable', dedupeKey,
    event: {
      transactionId, providerEventId, status: status(rawStatus), rawStatus,
      trackingSrc: source.src ?? source.partnerSession ?? source.sessionId,
      amountMinor: minor(root.amount ?? data.amount ?? transaction.amount ?? payment.amount),
      currency: text(root.currency, data.currency, transaction.currency, payment.currency)?.toUpperCase(),
      buyer: {
        name: text(customer.name, data.customer_name, root.customer_name),
        email: text(customer.email, data.customer_email, root.customer_email),
        phone: text(customer.phone, data.customer_phone, root.customer_phone),
        country: text(customer.country, data.country, root.country),
        postalCode: text(customer.postal_code, customer.postalCode, data.postal_code),
      },
      paymentMethod: text(root.payment_method, data.payment_method, transaction.payment_method, payment.method),
      product: {
        id: text(root.product_id, data.product_id, transaction.product_id),
        name: text(root.product_name, data.product_name, transaction.product_name),
        planId: text(root.plan_id, data.plan_id), planName: text(root.plan_name, data.plan_name),
      },
      source, occurredAt: date(root.occurred_at ?? root.created_at ?? data.occurred_at ?? data.created_at ?? root.timestamp),
    },
  };
}
