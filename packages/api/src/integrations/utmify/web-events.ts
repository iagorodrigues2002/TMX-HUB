export interface UtmifyWebEventInput {
  eventName: 'InitiateCheckout';
  pixelId: string;
  eventUrl: string;
  pageTitle?: string | null;
  source?: Record<string, string>;
  clientIp?: string | null;
  userAgent?: string | null;
}

const parameterKeys = new Set([
  'src',
  'sck',
  'utm_source',
  'utm_campaign',
  'utm_medium',
  'utm_content',
  'utm_term',
  'fbclid',
  'gclid',
  'ttclid',
  'campaign_id',
  'campaign_name',
  'adset_id',
  'adset_name',
  'ad_id',
  'ad_name',
  'placement',
  'site_source_name',
]);

function sourceUrl(value: string) {
  const url = new URL(value);
  return `${url.protocol}//${url.host}${url.pathname}`.replace(/\/+$/, '');
}

export function buildUtmifyWebEventPayload(input: UtmifyWebEventInput) {
  const source = input.source ?? {};
  const parameters = new URLSearchParams();
  for (const [key, value] of Object.entries(source)) {
    if (value && parameterKeys.has(key)) parameters.set(key, value);
  }
  return {
    type: input.eventName,
    lead: {
      pixelId: input.pixelId,
      userAgent: input.userAgent ?? '',
      parameters: parameters.size ? `?${parameters.toString()}` : '',
      ip: input.clientIp ?? undefined,
      fbc: source._fbc,
      fbp: source._fbp,
      gclid: source.gclid,
      ttclid: source.ttclid,
    },
    event: {
      sourceUrl: sourceUrl(input.eventUrl),
      pageTitle: input.pageTitle?.trim() || null,
    },
  };
}

export function isUtmifyWebEventAccepted(result: Record<string, unknown>) {
  const lead = result.lead as Record<string, unknown> | undefined;
  const event = result.event as Record<string, unknown> | undefined;
  return typeof lead?._id === 'string' && typeof event?._id === 'string';
}
