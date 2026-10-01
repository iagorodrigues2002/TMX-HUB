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
  buyer: { name?: string; firstName?: string; lastName?: string; email?: string; phone?: string; country?: string; postalCode?: string };
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

const minorAlready = (value: unknown): number | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const n = Number(String(value).replace(',', '.'));
  return Number.isFinite(n) ? Math.round(n) : undefined;
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
  const product = object(root.product);
  const attributionData = object(root.attribution);
  const metadata = object(root.metadata);
  const sourceData = object(data.data);
  const transactionId = text(
    root.transactionId,
    root.transaction_id, root.transactionId, root.payment_id, root.paymentId,
    data.transaction_id, data.transactionId, data.payment_id, data.paymentId,
    transaction.id, payment.id,
  );
  const providerEventId = text(root.transaction_id, root.transactionId, root.order_id, root.orderId, root.event_id, root.eventId, root.id, data.event_id, data.id);
  const applicationId = Number(root.applicationId ?? data.applicationId);
  const rawStatus = text(root.status, root.event, root.type, data.status, transaction.status, payment.status);
  const declaredStatus: PaysightStatus =
    applicationId === 200 ? 'refunded' : applicationId === 201 || applicationId === 202 ? 'chargeback' :
    root.chargedBack === true ? 'chargeback' : root.refunded === true ? 'refunded' :
    root.success === true ? 'paid' : status(rawStatus);
  // A transaction can legitimately arrive more than once with a new lifecycle
  // state (approved, refunded, chargeback). Dedupe the same notification, not
  // the whole transaction, otherwise a later reversal would be discarded.
  const eventFingerprint = text(root.event, root.status, root.type, data.event_id, data.id, root.approved_at, root.completed, root.created_at) ?? 'event';
  const dedupeKey = transactionId
    ? `${transactionId}:${declaredStatus}:${eventFingerprint}`
    : createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  if (!transactionId) {
    return { kind: 'quarantined', reason: 'missing_transaction_id', diagnostics: ['O webhook não contém transaction_id/payment_id estável.'], dedupeKey };
  }
  const custom = { ...metadata, ...sourceData, ...object(data.metadata), ...attributionData };
  const source: Record<string, string> = {};
  for (const key of ['src', 'sck', 'sessionId', 'partnerSession', 'paysightSession', 'clickId', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'wbraid', 'gbraid', 'fbclid', 'ttclid', 'campaign_name', 'campaign_id', 'adset_name', 'adset_id', 'ad_name', 'ad_id', 'placement']) {
    const value = text(custom[key], root[key], data[key]);
    if (value) source[key] = value;
  }
  const partnerSession = text(root.partnerSession, root.partner_session, root.sessionId, root.session_id, source.partnerSession, source.sessionId);
  const paysightSession = text(root.paysightSession, root.paysight_session, source.paysightSession);
  const customerIp = text(customer.ip, root.customer_ip, root.ip, data.customer_ip);
  const funnel = text(root.funnel, data.funnel);
  const customerName = text(customer.name, root.firstName && root.lastName ? `${root.firstName} ${root.lastName}` : root.firstName, data.customer_name, root.customer_name);
  const explicitFirstName = text(customer.first_name, customer.firstName, root.first_name, root.firstName);
  const explicitLastName = text(customer.last_name, customer.lastName, root.last_name, root.lastName);
  const nameParts = customerName?.trim().split(/\s+/) ?? [];
  if (partnerSession) source.partnerSession = partnerSession;
  if (paysightSession) source.paysightSession = paysightSession;
  if (customerIp) source.client_ip = customerIp;
  if (funnel) source.funnel = funnel;
  return {
    kind: 'processable', dedupeKey,
    event: {
      transactionId, providerEventId, status: declaredStatus, rawStatus,
      trackingSrc: source.src ?? source.partnerSession ?? source.sessionId,
      amountMinor: minorAlready(product.price_cents) ?? minor(root.amount ?? data.amount ?? transaction.amount ?? payment.amount ?? product.price),
      currency: text(product.currency, root.currency, data.currency, transaction.currency, payment.currency)?.toUpperCase(),
      buyer: {
        name: customerName,
        firstName: explicitFirstName ?? nameParts[0],
        lastName: explicitLastName ?? (nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined),
        email: text(customer.email, root.email, data.customer_email, root.customer_email),
        phone: text(customer.phone, data.customer_phone, root.customer_phone),
        country: text(customer.country, data.country, root.country),
        postalCode: text(customer.postal_code, customer.postalCode, data.postal_code),
      },
      paymentMethod: text(root.payment_method, data.payment_method, transaction.payment_method, payment.method),
      product: {
        id: text(product.id, root.productId, root.product_id, data.product_id, transaction.product_id),
        name: text(product.name, root.product_name, data.product_name, transaction.product_name),
        planId: text(root.plan_id, data.plan_id), planName: text(root.plan_name, data.plan_name),
      },
      source, occurredAt: date(root.approved_at ?? root.completed ?? root.sent ?? root.occurred_at ?? root.created_at ?? data.occurred_at ?? data.created_at ?? root.timestamp),
    },
  };
}
