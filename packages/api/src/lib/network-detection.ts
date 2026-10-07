export type TrafficNetwork = 'meta' | 'google' | 'tiktok' | 'twitter' | 'other';

export type NetworkParams = Record<string, unknown> | URLSearchParams;

export type CanonicalClickIds = {
  fbc?: string;
  gclid?: string;
  wbraid?: string;
  gbraid?: string;
  ttclid?: string;
  twclid?: string;
};

export type NetworkIdentifiers = CanonicalClickIds & {
  fbp?: string;
  ttp?: string;
};

function valueFrom(params: NetworkParams, key: string): string | undefined {
  const value = params instanceof URLSearchParams ? params.get(key) : params[key];
  const candidate = Array.isArray(value) ? value[0] : value;
  if (candidate === null || candidate === undefined) return undefined;
  const normalized = String(candidate).trim();
  return normalized || undefined;
}

function firstValue(params: NetworkParams, ...keys: string[]) {
  for (const key of keys) {
    const value = valueFrom(params, key);
    if (value) return value;
  }
  return undefined;
}

function sourceNetwork(params: NetworkParams): TrafficNetwork {
  const source = valueFrom(params, 'utm_source')
    ?.toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  if (!source) return 'other';
  if (['meta', 'facebook', 'fb', 'instagram', 'ig', 'an', 'msg'].includes(source)) return 'meta';
  if (['google', 'googleads', 'adwords', 'youtube', 'yt'].includes(source)) return 'google';
  if (['tiktok', 'tiktokads', 'tt'].includes(source)) return 'tiktok';
  if (['twitter', 'twitterads', 'x', 'xads'].includes(source)) return 'twitter';
  return 'other';
}

export function detectNetwork(params: NetworkParams): TrafficNetwork {
  const candidates: TrafficNetwork[] = [];
  if (firstValue(params, 'fbclid', 'fbc', '_fbc')) candidates.push('meta');
  if (firstValue(params, 'gclid', 'wbraid', 'gbraid')) candidates.push('google');
  if (valueFrom(params, 'ttclid')) candidates.push('tiktok');
  if (valueFrom(params, 'twclid')) candidates.push('twitter');
  if (candidates.length === 1) return candidates[0]!;
  const source = sourceNetwork(params);
  if (source !== 'other' && (candidates.length === 0 || candidates.includes(source))) return source;
  return candidates[0] ?? source;
}

export function buildFbcFromFbclid(fbclid: string, timestamp: number): string {
  const normalizedClickId = fbclid.trim();
  const normalizedTimestamp = Math.trunc(timestamp);
  if (!normalizedClickId) throw new Error('fbclid_required');
  if (!Number.isFinite(normalizedTimestamp) || normalizedTimestamp <= 0) {
    throw new Error('fbclid_timestamp_invalid');
  }
  return `fb.1.${normalizedTimestamp}.${normalizedClickId}`;
}

function metaFbc(params: NetworkParams, fallbackTimestamp = Date.now()) {
  const existing = firstValue(params, 'fbc', '_fbc');
  if (existing) return existing;
  const fbclid = valueFrom(params, 'fbclid');
  if (!fbclid) return undefined;
  const rawTimestamp = Number(valueFrom(params, '_fbclid_ts'));
  const timestamp =
    Number.isFinite(rawTimestamp) && rawTimestamp > 0 ? rawTimestamp : fallbackTimestamp;
  return buildFbcFromFbclid(fbclid, timestamp);
}

export function canonicalClickId(
  network: TrafficNetwork,
  params: NetworkParams,
): CanonicalClickIds {
  switch (network) {
    case 'meta': {
      const fbc = metaFbc(params);
      return fbc ? { fbc } : {};
    }
    case 'google': {
      const gclid = valueFrom(params, 'gclid');
      const wbraid = valueFrom(params, 'wbraid');
      const gbraid = valueFrom(params, 'gbraid');
      return {
        ...(gclid ? { gclid } : {}),
        ...(wbraid ? { wbraid } : {}),
        ...(gbraid ? { gbraid } : {}),
      };
    }
    case 'tiktok': {
      const ttclid = valueFrom(params, 'ttclid');
      return ttclid ? { ttclid } : {};
    }
    case 'twitter': {
      const twclid = valueFrom(params, 'twclid');
      return twclid ? { twclid } : {};
    }
    default:
      return {};
  }
}

/** Captures every supported identifier; destination fan-out remains network-specific. */
export function collectNetworkIdentifiers(
  params: NetworkParams,
  fallbackTimestamp = Date.now(),
): NetworkIdentifiers {
  const fbc = metaFbc(params, fallbackTimestamp);
  const fbp = firstValue(params, 'fbp', '_fbp');
  const gclid = valueFrom(params, 'gclid');
  const wbraid = valueFrom(params, 'wbraid');
  const gbraid = valueFrom(params, 'gbraid');
  const ttclid = valueFrom(params, 'ttclid');
  const ttp = firstValue(params, 'ttp', '_ttp');
  const twclid = valueFrom(params, 'twclid');
  return {
    ...(fbc ? { fbc } : {}),
    ...(fbp ? { fbp } : {}),
    ...(gclid ? { gclid } : {}),
    ...(wbraid ? { wbraid } : {}),
    ...(gbraid ? { gbraid } : {}),
    ...(ttclid ? { ttclid } : {}),
    ...(ttp ? { ttp } : {}),
    ...(twclid ? { twclid } : {}),
  };
}

/** Returns only the identifiers accepted by the detected destination network. */
export function canonicalNetworkIdentifiers(params: NetworkParams): NetworkIdentifiers {
  const network = detectNetwork(params);
  const identifiers = collectNetworkIdentifiers(params);
  return {
    ...canonicalClickId(network, params),
    ...(network === 'meta' && identifiers.fbp ? { fbp: identifiers.fbp } : {}),
    ...(network === 'tiktok' && identifiers.ttp ? { ttp: identifiers.ttp } : {}),
  };
}
