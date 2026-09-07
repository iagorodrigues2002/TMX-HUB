export interface UtmifyOrderInput {
  isTest?: boolean;
  orderId: string;
  provider: string;
  status: string;
  amountMinor: number;
  currency: string;
  createdAt: Date;
  paidAt?: Date | null;
  refundedAt?: Date | null;
  buyer: {
    name?: string;
    email?: string;
    phone?: string;
    document?: string;
    country?: string;
  };
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

// UTMify canonicalizes the "source" side: their Meta connector matches
// facebook / instagram (uppercase, short) and rejects other spellings as
// "UTMs inválidas". The Meta URL template macro {{site_source_name}}
// returns "fb"/"ig"/"an"/"msg" — normalize to what UTMify expects.
const UTM_SOURCE_ALIASES: Record<string, string> = {
  fb: 'FB',
  facebook: 'FB',
  ig: 'IG',
  instagram: 'IG',
  an: 'AN',
  msg: 'MSG',
  google: 'GOOGLE',
  tiktok: 'TIKTOK',
};

function normalizeUtmSource(raw: string | undefined): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return UTM_SOURCE_ALIASES[key] ?? raw.trim().toUpperCase();
}

// UTMify's campaigns tab matches a sale to a Meta campaign by parsing
// `<name>|<id>` from utm_campaign / utm_medium / utm_content. Their docs
// example uses exactly this format ("CAMPANHA_5|761832537749495"). If we
// send only the name, UTMify falls back to "UTMs inválidas" because it
// can't resolve the campaign row. Vendepay hands us the numeric IDs in a
// separate URL param (campaign_id / adset_id / ad_id / placement) that we
// already stitch into `source`, so we can compose the expected shape.
function withId(nameLike: string | undefined, id: string | undefined): string | null {
  const name = nameLike?.trim();
  const rawId = id?.trim();
  if (!name && !rawId) return null;
  if (name?.includes('|')) return name; // already in name|id format
  if (name && rawId) return `${name}|${rawId}`;
  return name ?? rawId ?? null;
}

function formatUtmifyDate(value: Date | null | undefined): string | null {
  if (!value) return null;
  // UTMify documents UTC timestamps as `YYYY-MM-DD HH:mm:ss`. Although its
  // endpoint may answer SUCCESS to ISO-8601 strings, those orders can be
  // silently discarded by the ingestion pipeline.
  return value.toISOString().slice(0, 19).replace('T', ' ');
}

function normalizePaymentMethod(raw: string | undefined): string {
  const value = raw?.trim().toLowerCase().replace(/[ -]+/g, '_');
  if (!value) return 'credit_card';
  if (['credit_card', 'creditcard', 'card', 'cartao', 'cartão', 'cc'].includes(value))
    return 'credit_card';
  if (['pix', 'boleto', 'paypal', 'free_price'].includes(value)) return value;
  // VendePay sales are card-first. UTMify rejects values outside its enum,
  // so an unknown provider label must not poison an otherwise valid sale.
  return 'credit_card';
}

export function buildUtmifyOrderPayload(input: UtmifyOrderInput) {
  const source = input.source ?? {};
  const countryCandidate = input.buyer.country ?? source.country ?? 'BR';
  const country = /^[A-Za-z]{2}$/.test(countryCandidate) ? countryCandidate.toUpperCase() : 'BR';
  return {
    isTest: input.isTest ?? false,
    orderId: input.orderId,
    platform: `TMXHUB/${input.provider}`,
    paymentMethod: normalizePaymentMethod(source.payment_method),
    status: statusMap[input.status] ?? 'waiting_payment',
    createdAt: formatUtmifyDate(input.createdAt),
    approvedDate:
      formatUtmifyDate(input.paidAt) ??
      (['paid', 'refunded', 'chargeback'].includes(input.status)
        ? formatUtmifyDate(input.createdAt)
        : null),
    refundedAt: ['refunded', 'chargeback'].includes(input.status)
      ? formatUtmifyDate(input.refundedAt ?? input.createdAt)
      : null,
    customer: {
      name: input.buyer.name ?? 'Cliente',
      email: input.buyer.email ?? '',
      phone: input.buyer.phone ?? '',
      document: input.buyer.document ?? null,
      country,
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
      // Canonicalized to what UTMify's Meta connector recognizes. `fb` from
      // Meta's {{site_source_name}} macro becomes `FB`, etc.
      utm_source: normalizeUtmSource(source.utm_source),
      // UTMify's Meta campaigns report requires the entity id appended to
      // each name. Landing-page values supply the names and the recovered
      // first-party ids make the sale resolvable by UTMify.
      utm_campaign: withId(source.utm_campaign ?? source.campaign_name, source.campaign_id),
      utm_medium: withId(source.adset_name ?? source.utm_term, source.adset_id),
      utm_content: withId(source.utm_content ?? source.ad_name, source.ad_id),
      utm_term: source.placement ?? source.utm_medium ?? null,
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
