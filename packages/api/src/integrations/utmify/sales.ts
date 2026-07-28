export interface UtmifyOrderInput {
  isTest?: boolean;
  orderId: string;
  provider: string;
  status: string;
  amountMinor: number;
  currency: string;
  createdAt: Date;
  paidAt?: Date | null;
  buyer: { name?: string; email?: string; phone?: string; document?: string };
  source?: Record<string, string>;
  clientIp?: string | null;
}

const statusMap: Record<string, string> = {
  pending: 'waiting_payment',
  paid: 'paid',
  refused: 'refused',
  refunded: 'refunded',
  chargeback: 'chargedback',
  cancelled: 'canceled',
};

export function buildUtmifyOrderPayload(input: UtmifyOrderInput) {
  const source = input.source ?? {};
  return {
    isTest: input.isTest ?? false,
    orderId: input.orderId,
    platform: `TMXHUB/${input.provider}`,
    paymentMethod: source.payment_method ?? 'unknown',
    status: statusMap[input.status] ?? 'waiting_payment',
    createdAt: input.createdAt.toISOString(),
    approvedDate: input.paidAt?.toISOString() ?? null,
    refundedAt: ['refunded', 'chargeback'].includes(input.status)
      ? input.createdAt.toISOString()
      : null,
    customer: {
      name: input.buyer.name ?? 'Cliente',
      email: input.buyer.email ?? '',
      phone: input.buyer.phone ?? '',
      document: input.buyer.document ?? null,
      country: source.country ?? 'BR',
      ip: input.clientIp ?? null,
    },
    products: [
      {
        id: source.product_id ?? input.orderId,
        name: source.product_name ?? 'Produto',
        planId: source.plan_id ?? null,
        planName: source.plan_name ?? null,
        quantity: 1,
        priceInCents: input.amountMinor,
      },
    ],
    trackingParameters: {
      src: source.src ?? null,
      sck: source.sck ?? null,
      utm_source: source.utm_source ?? null,
      utm_campaign: source.utm_campaign ?? null,
      utm_medium: source.utm_medium ?? null,
      utm_content: source.utm_content ?? null,
      utm_term: source.utm_term ?? null,
    },
    commission: {
      totalPriceInCents: input.amountMinor,
      gatewayFeeInCents: Number(source.gateway_fee_in_cents ?? 0),
      userCommissionInCents: Math.max(
        0,
        input.amountMinor - Number(source.gateway_fee_in_cents ?? 0),
      ),
      currency: input.currency,
    },
  };
}
