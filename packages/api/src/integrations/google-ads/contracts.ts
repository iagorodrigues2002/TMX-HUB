import { z } from 'zod';

// Account IDs may be pasted in the human-readable 123-456-7890 format.
export const GoogleAdsDestinationSchema = z.object({
  name: z.string().trim().min(1).max(100),
  customer_id: z.string().trim().transform((v) => v.replace(/-/g, ''))
    .pipe(z.string().regex(/^\d{10}$/, 'Informe os 10 dígitos da conta Google Ads.')),
  conversion_action_id: z.string().trim().regex(/^\d{1,30}$/),
}).strict();

// A draft cannot be enabled by a request body or by accidentally reusing a Meta setting.
export const GOOGLE_ADS_DELIVERY_ENABLED = false;

export type GooglePurchase = {
  projectId: string;
  orderId: string;
  status: string;
  orderKind: string;
  paidAt: string;
  value: number | null;
  currency: string | null;
  adIdentifiers: { gclid?: string; gbraid?: string; wbraid?: string };
};

/** Pure preview; never performs a request or reconstructs attribution from UTMs. */
export function previewGooglePurchase(order: GooglePurchase, customerId: string, actionId: string) {
  if (order.status !== 'paid' || order.orderKind !== 'front') {
    throw new Error('google_purchase_requires_paid_front');
  }
  if (!order.projectId || !order.orderId) throw new Error('google_purchase_missing_identity');
  if (!Number.isFinite(Date.parse(order.paidAt)) || !/(Z|[+-]\d{2}:\d{2})$/.test(order.paidAt)) {
    throw new Error('google_purchase_invalid_timestamp');
  }
  if (order.value === null || !Number.isFinite(order.value) || order.value <= 0 ||
      !order.currency || !/^[A-Z]{3}$/.test(order.currency)) {
    throw new Error('google_purchase_invalid_value');
  }
  const ids = Object.fromEntries(Object.entries(order.adIdentifiers)
    .filter(([key, value]) => ['gclid', 'gbraid', 'wbraid'].includes(key) && value?.trim())
    .map(([key, value]) => [key, value!.trim()]));
  if (!Object.keys(ids).length) throw new Error('google_purchase_missing_match_data');
  const destination = GoogleAdsDestinationSchema.parse({
    name: 'preview', customer_id: customerId, conversion_action_id: actionId,
  });
  return {
    validateOnly: true,
    destinations: [{
      operatingAccount: { accountType: 'GOOGLE_ADS', accountId: destination.customer_id },
      productDestinationId: destination.conversion_action_id,
    }],
    events: [{
      transactionId: `tmx:${order.projectId}:${order.orderId}`,
      eventTimestamp: new Date(order.paidAt).toISOString(),
      eventSource: 'WEB',
      conversionValue: order.value,
      currency: order.currency,
      adIdentifiers: ids,
    }],
  };
}
