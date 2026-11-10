export function monitorSources(sources: string[], domains: string[] = []) {
  const combined = [
    ...new Set([
      ...sources,
      ...domains.flatMap((domain) => {
        try {
          const value = decodeURIComponent(domain).trim();
          const u = new URL(value.includes('://') ? value : `https://${value}`);
          if (
            !u.hostname.includes('.') ||
            !/^[a-z0-9.-]+$/i.test(u.hostname) ||
            u.username ||
            u.password ||
            !['http:', 'https:'].includes(u.protocol)
          )
            return [];
          const q = new URLSearchParams({
            active_status: 'active',
            ad_type: 'all',
            country: 'ALL',
            q: `"${u.hostname.toLowerCase()}"`,
            search_type: 'keyword_exact_phrase',
          });
          return [`https://www.facebook.com/ads/library/?${q}`];
        } catch {
          return [];
        }
      }),
    ]),
  ].slice(0, 20);
  const seen = new Set<string>();
  return combined.filter((source) => {
    let key = source;
    try {
      const url = new URL(source);
      const page = url.searchParams.get('view_all_page_id');
      const query = url.searchParams.get('q')?.replace(/^"|"$/g, '').toLowerCase();
      key = page ? `page:${page}` : `query:${query}:${url.searchParams.get('country') ?? 'ALL'}`;
    } catch {
      /* Invalid sources remain visible to validation. */
    }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
