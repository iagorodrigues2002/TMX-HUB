import {
  type ExplodelyEventKind,
  explodelyAmountMinor,
  normalizeExplodely,
} from '../explodely/normalize.js';
import {
  type VendepayNormalizeResult,
  type VendepayStatus,
  normalizeVendepay,
} from './normalize.js';

function asVendepayResult(
  result: Extract<ReturnType<typeof normalizeExplodely>, { kind: 'processable' }>,
): VendepayNormalizeResult {
  const { event } = result;
  const statusByKind: Record<ExplodelyEventKind, VendepayStatus> = {
    sale: 'paid',
    rebill: 'paid',
    refund: 'refunded',
    chargeback: 'chargeback',
    rebill_cancellation: 'cancelled',
    decline: 'refused',
    partial: 'abandoned',
  };
  const status = statusByKind[event.kind];
  return {
    kind: 'processable',
    dedupeKey: event.transactionId,
    event: {
      transactionId: event.externalId,
      providerEventId: event.transactionId,
      status,
      rawStatus: event.rawStatus,
      trackingSrc: event.trackingId ?? undefined,
      vendid: undefined,
      amountMinor:
        explodelyAmountMinor(event.amount, { amount_unit: 'decimal', amount_scale: 2 }) ??
        undefined,
      currency: event.currency ?? 'USD',
      buyer: {
        name: event.buyer.name,
        email: event.buyer.email,
        phone: event.buyer.phone,
        country: event.buyer.country,
        postalCode: event.buyer.postalCode,
      },
      product: {
        id: typeof event.product.id === 'string' ? event.product.id : undefined,
        name: typeof event.product.name === 'string' ? event.product.name : undefined,
      },
      source: event.source,
      occurredAt: event.occurredAt.toISOString(),
    },
  };
}

/**
 * Narrow compatibility bridge for the one historic VendePay URL that is used
 * by Explodely. The caller, not this adapter, decides whether a connection is
 * explicitly authorized for this fallback. All other VendePay connections
 * keep their canonical normalizer unchanged.
 */
export function normalizeVendepayWebhook(
  payload: unknown,
  allowExplodelyCompatibility: boolean,
): VendepayNormalizeResult {
  if (!allowExplodelyCompatibility) return normalizeVendepay(payload);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return normalizeVendepay(payload);
  }
  const rawBody = Buffer.from(JSON.stringify(payload));
  const explodely = normalizeExplodely(payload as Record<string, unknown>, rawBody);
  return explodely.kind === 'processable'
    ? asVendepayResult(explodely)
    : normalizeVendepay(payload);
}
