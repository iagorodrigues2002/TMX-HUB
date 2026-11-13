import type { LibraryAd } from './spy-library-reader';
export function spyDomain(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return;
  try {
    const url = new URL(raw);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return;
    if (['l.facebook.com', 'lm.facebook.com'].includes(url.hostname))
      return spyDomain(url.searchParams.get('u'));
    const host = url.hostname.toLowerCase().replace(/^www\./, '');
    if (
      !host.includes('.') ||
      /(^|\.)(facebook\.com|instagram\.com|fbcdn\.net|fbsbx\.com)$/.test(host)
    )
      return;
    return host;
  } catch {
    return;
  }
}
/** Only provider destination fields, never media CDN URLs or guesses from the offer name. */
export function spyAdDomains(ad: Pick<LibraryAd, 'destinationDomains' | 'creativeText'>) {
  const found = new Set(ad.destinationDomains ?? []);
  try {
    const copy = JSON.parse(ad.creativeText ?? 'null');
    if (Array.isArray(copy)) {
      const links = [
        copy[5],
        ...(Array.isArray(copy[6])
          ? copy[6].map((card) => (Array.isArray(card) ? card[3] : null))
          : []),
      ];
      for (const link of links) {
        const host = spyDomain(link);
        if (host) found.add(host);
      }
    }
  } catch {}
  return [...found].sort();
}
