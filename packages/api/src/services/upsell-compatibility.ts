const cache = new Map<string, { compatible: boolean; expiresAt: number }>();

export async function checkUpsellCompatibility(
  destinationUrl: string,
  vendaId: string,
  forceRefresh = false,
) {
  const cacheKey = `${destinationUrl}|${vendaId}`;
  const cached = cache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.compatible;
  let compatible = false;
  try {
    const pageResponse = await fetch(destinationUrl, {
      signal: AbortSignal.timeout(6_000),
      headers: { 'user-agent': 'TMX-Upsell-Validator/1.0' },
    });
    const pageHtml = pageResponse.ok ? await pageResponse.text() : '';
    const upsellId = pageHtml.match(/upsellId=([0-9a-f-]{36})/i)?.[1];
    if (upsellId) {
      const intentUrl = new URL('https://bff.vendepay.com/api/up-sell/intent');
      intentUrl.searchParams.set('upsellId', upsellId);
      intentUrl.searchParams.set('vendaId', vendaId);
      const intentResponse = await fetch(intentUrl, {
        signal: AbortSignal.timeout(6_000),
        headers: { accept: 'application/json', 'user-agent': 'TMX-Upsell-Validator/1.0' },
      });
      compatible = intentResponse.ok;
    }
  } catch {
    compatible = false;
  }
  cache.set(cacheKey, { compatible, expiresAt: Date.now() + 10 * 60_000 });
  return compatible;
}
