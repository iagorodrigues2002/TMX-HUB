export interface SrcsetCandidate {
  url: string;
  descriptor: string;
}

export function parseSrcset(value: string): SrcsetCandidate[] {
  const candidates: SrcsetCandidate[] = [];
  let i = 0;
  const n = value.length;
  while (i < n) {
    while (i < n && (value[i] === ',' || /\s/.test(value[i] ?? ''))) i += 1;
    if (i >= n) break;
    let urlEnd = i;
    while (urlEnd < n && !/\s/.test(value[urlEnd] ?? '') && value[urlEnd] !== ',') urlEnd += 1;
    const url = value.slice(i, urlEnd);
    i = urlEnd;
    while (i < n && /\s/.test(value[i] ?? '')) i += 1;
    let descEnd = i;
    while (descEnd < n && value[descEnd] !== ',') descEnd += 1;
    const descriptor = value.slice(i, descEnd).trim();
    candidates.push({ url, descriptor });
    i = descEnd;
    if (i < n && value[i] === ',') i += 1;
  }
  return candidates;
}

export function serializeSrcset(items: SrcsetCandidate[]): string {
  return items
    .map((c) => (c.descriptor ? `${c.url} ${c.descriptor}` : c.url))
    .join(', ');
}
