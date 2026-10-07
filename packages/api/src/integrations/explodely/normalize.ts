import { createHash } from 'node:crypto';

export type ExplodelyStatus =
  | 'paid'
  | 'pending'
  | 'refused'
  | 'refunded'
  | 'chargeback'
  | 'cancelled'
  | 'abandoned'
  | 'unknown';

export type ExplodelyEvent = {
  transactionId: string;
  providerEventId?: string;
  status: ExplodelyStatus;
  rawStatus?: string;
  trackingSrc?: string;
  amountMinor?: number;
  currency?: string;
  buyer: {
    name?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    country?: string;
    postalCode?: string;
  };
  paymentMethod?: string;
  product: { id?: string; name?: string; planId?: string; planName?: string };
  source: Record<string, string>;
  occurredAt: string;
};

export type ExplodelyNormalizationResult =
  | { kind: 'processable'; event: ExplodelyEvent; dedupeKey: string }
  | { kind: 'quarantined'; reason: string; diagnostics: string[]; dedupeKey: string };

const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

const textAt = (source: Record<string, unknown>, ...keys: string[]) => {
  const entries = Object.entries(source);
  for (const key of keys) {
    const value =
      source[key] ??
      entries.find(([candidate]) => candidate.toLowerCase() === key.toLowerCase())?.[1];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
};

const lifecycle = (value?: string): ExplodelyStatus => {
  const normalized = (value ?? '').toLowerCase().replace(/[\s.-]+/g, '_');
  if (/(chargeback|charge_back|dispute)/.test(normalized)) return 'chargeback';
  if (/(refund|refunded)/.test(normalized)) return 'refunded';
  if (/(sale|rebill|paid|approved|captured|complete|success|settled)/.test(normalized))
    return 'paid';
  if (/(cancel|void)/.test(normalized)) return 'cancelled';
  if (/(declin|refus|fail|error)/.test(normalized)) return 'refused';
  if (/(abandon|expired)/.test(normalized)) return 'abandoned';
  if (/(pending|authoriz|process|created)/.test(normalized)) return 'pending';
  return 'unknown';
};

const amountMinor = (value: unknown): number | undefined => {
  if (typeof value !== 'string' && typeof value !== 'number') return undefined;
  const parsed = Number(String(value).replace(',', '.'));
  return Number.isFinite(parsed) ? Math.round(Math.abs(parsed) * 100) : undefined;
};

const occurredAt = (value: unknown) => {
  if (typeof value === 'number' || (typeof value === 'string' && /^\d{10,13}$/.test(value))) {
    const timestamp = Number(value);
    const date = new Date(timestamp < 10_000_000_000 ? timestamp * 1000 : timestamp);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
};

/**
 * Explodely supports the current Seller Hub webhooks and legacy IPN/ISN.
 * Both carry form/query-like fields, so aliases are deliberately case-insensitive.
 * The documented delivery does not expose a signed-event protocol; TMX authenticates
 * this receiver with its unique high-entropy webhook token.
 */
export function normalizeExplodely(
  payload: unknown,
  fallbackCurrency = 'USD',
): ExplodelyNormalizationResult {
  const root = object(payload);
  const transactionId = textAt(
    root,
    'orderid',
    'order_id',
    'orderId',
    'transaction_id',
    'transactionId',
  );
  const rawStatus = textAt(root, 'transactiontype', 'type', 'event', 'status');
  const status = lifecycle(rawStatus);
  const fingerprint =
    textAt(
      root,
      'event_id',
      'id',
      'refundtimestamp',
      'saletimestamp',
      'timestamp',
      'saletimedate',
    ) ??
    rawStatus ??
    'event';
  const dedupeKey = transactionId
    ? `${transactionId}:${status}:${fingerprint}`
    : createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  if (!transactionId) {
    return {
      kind: 'quarantined',
      reason: 'missing_order_id',
      diagnostics: ['O webhook do Explodely não contém orderid/order_id estável.'],
      dedupeKey,
    };
  }

  const source: Record<string, string> = {};
  for (const key of [
    'src',
    'tid',
    'tracking_id',
    'trackingId',
    'vtid',
    'sck',
    'sid',
    'subid',
    'xcod',
    ...Array.from({ length: 20 }, (_, index) => `sub${index + 1}`),
    'sessionId',
    'clickId',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term',
    'gclid',
    'wbraid',
    'gbraid',
    'fbclid',
    'fbc',
    'fbp',
    '_fbc',
    '_fbp',
    'ttclid',
    '_ttp',
    'ttp',
    'campaign_name',
    'campaign_id',
    'adset_name',
    'adset_id',
    'ad_name',
    'ad_id',
    'placement',
  ]) {
    const value = textAt(root, key);
    if (value) source[key] = value;
  }
  for (let index = 1; index <= 5; index += 1) {
    const value = textAt(root, `custom${index}`);
    if (value) source[`custom${index}`] = value;
  }
  const trackingSrc =
    source.src ?? source.tid ?? source.tracking_id ?? source.trackingId ?? source.vtid;
  if (trackingSrc) source.src = trackingSrc;
  const fbc = source.fbc ?? source._fbc;
  const fbp = source.fbp ?? source._fbp;
  if (fbc) source._fbc = fbc;
  if (fbp) source._fbp = fbp;
  const customerIp = textAt(root, 'ipadd', 'ip_address', 'customer_ip', 'ip');
  if (customerIp) source.client_ip = customerIp;

  const name = textAt(root, 'customerName', 'customer_name', 'name');
  const nameParts = name?.split(/\s+/) ?? [];
  return {
    kind: 'processable',
    dedupeKey,
    event: {
      transactionId,
      providerEventId: textAt(root, 'event_id', 'id'),
      status,
      rawStatus,
      trackingSrc,
      amountMinor: amountMinor(textAt(root, 'amount', 'total', 'price')),
      currency: (textAt(root, 'currency') ?? fallbackCurrency).toUpperCase(),
      buyer: {
        name,
        firstName: textAt(root, 'first_name', 'firstName') ?? nameParts[0],
        lastName:
          textAt(root, 'last_name', 'lastName') ??
          (nameParts.length > 1 ? nameParts.slice(1).join(' ') : undefined),
        email: textAt(root, 'customerEmail', 'customer_email', 'email'),
        phone: textAt(root, 'customerPhone', 'customer_phone', 'phone'),
        country: textAt(root, 'country', 'countryCode', 'country_code')?.toUpperCase(),
        postalCode: textAt(root, 'zipcode', 'zip_code', 'postal_code'),
      },
      paymentMethod: textAt(root, 'payment_method', 'paymentMethod', 'billdesc'),
      product: {
        id: textAt(root, 'productId', 'product_id', 'productid'),
        name: textAt(root, 'productName', 'product_name', 'productname'),
        planId: textAt(root, 'funnelId', 'funnel_id'),
        planName: textAt(root, 'funnel', 'funnelName', 'funnel_name'),
      },
      source,
      occurredAt: occurredAt(
        textAt(root, 'refundtimestamp', 'saletimestamp', 'timestamp', 'created_at', 'saletimedate'),
      ),
    },
  };
}
