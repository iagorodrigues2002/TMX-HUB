/** Self-contained: also embedded in the browser tracker. Never infer IDs from names. */
export function normalizeAdAttribution(input: Record<string, string>): Record<string, string> {
  const source: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string' && value.trim() && !/\{\{[^}]+\}\}/.test(value))
      source[key] = value.trim();
  }
  const numericId = (value: string | undefined) =>
    value && /^\d{12,25}$/.test(value) ? value : undefined;
  for (const [canonical, alias] of [
    ['campaign_id', 'campaignId'],
    ['adset_id', 'adsetId'],
    ['ad_id', 'adId'],
  ]) {
    const id = numericId(source[alias!]);
    if (!source[canonical!] && id) source[canonical!] = id;
  }
  const meta =
    /^(fb|ig|facebook|instagram|meta|an|msg)$/i.test(source.utm_source ?? '') ||
    Boolean(source.fbclid || source.fbc || source._fbc);
  if (!meta) return source;
  for (const [canonical, utm] of [
    ['campaign_id', 'utm_campaign'],
    ['adset_id', 'utm_medium'],
    ['ad_id', 'utm_content'],
  ]) {
    const value = source[utm!];
    const id = value?.includes('|') ? numericId(value.split('|').at(-1)) : undefined;
    if (!source[canonical!] && id) source[canonical!] = id;
  }
  return source;
}
