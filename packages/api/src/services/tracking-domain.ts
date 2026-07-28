import { getDomain } from 'tldts';

export function cleanHostname(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .split('/')[0]!
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

export function canonicalTrackingHostname(value: string): string | null {
  const registrableDomain = getDomain(cleanHostname(value), { allowPrivateDomains: true });
  return registrableDomain ? `tmx.${registrableDomain}` : null;
}
