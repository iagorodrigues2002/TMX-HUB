export interface UtmifyOrderInput {
  isTest?: boolean;
  orderId: string;
  provider: string;
  status: string;
  amountMinor: number;
  currency: string;
  createdAt: Date;
  paidAt?: Date | null;
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

export function buildUtmifyOrderPayload(input: UtmifyOrderInput) {
  const source = input.source ?? {};
  const countryCandidate = input.buyer.country ?? source.country ?? 'BR';
  const country = /^[A-Za-z]{2}$/.test(countryCandidate) ? countryCandidate.toUpperCase() : 'BR';
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
      // `<name>|<id>` shape, per UTMify docs. Falls back to whatever we
      // have if the numeric id is missing.
      utm_campaign: withId(source.utm_campaign ?? source.campaign_name, source.campaign_id),
      utm_medium: withId(source.adset_name ?? source.utm_medium, source.adset_id),
      utm_content: withId(source.ad_name ?? source.utm_content, source.ad_id),
      // Meta URL template usually points utm_term at the adset name, but
      // UTMify's example puts placement here. Prefer placement when we have
      // it (their pixel captures it separately), fall back to whatever the
      // ad URL provided.
      utm_term: source.placement ?? source.utm_term ?? null,
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
