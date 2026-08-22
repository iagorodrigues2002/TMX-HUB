export type UpsellCompatibilityState =
  | 'recoverable'
  | 'already_converted'
  | 'temporary_failure'
  | 'definitive_failure';

export type UpsellCompatibilityResult = {
  compatible: boolean;
  state: UpsellCompatibilityState;
  reason: string;
  attempts: number;
  httpStatus: number | null;
};

type CompatibilityOptions = {
  retryDelaysMs?: number[];
  timeoutMs?: number;
};

const resultCache = new Map<string, { result: UpsellCompatibilityResult; expiresAt: number }>();
const upsellIdCache = new Map<string, { upsellId: string; expiresAt: number }>();

const sleep = (delayMs: number) =>
  delayMs > 0 ? new Promise<void>((resolve) => setTimeout(resolve, delayMs)) : Promise.resolve();

async function resolveUpsellId(destinationUrl: string, timeoutMs: number, forceRefresh: boolean) {
  const cached = upsellIdCache.get(destinationUrl);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.upsellId;
  const pageResponse = await fetch(destinationUrl, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'user-agent': 'TMX-Upsell-Validator/2.0' },
  });
  if (!pageResponse.ok) throw new Error(`destination_http_${pageResponse.status}`);
  const pageHtml = await pageResponse.text();
  const upsellId = pageHtml.match(/upsellId=([0-9a-f-]{36})/i)?.[1];
  if (!upsellId) throw new Error('upsell_id_not_found');
  upsellIdCache.set(destinationUrl, { upsellId, expiresAt: Date.now() + 60 * 60_000 });
  return upsellId;
}

export async function checkUpsellCompatibilityDetailed(
  destinationUrl: string,
  vendaId: string,
  forceRefresh = false,
  options: CompatibilityOptions = {},
): Promise<UpsellCompatibilityResult> {
  const cacheKey = `${destinationUrl}|${vendaId}`;
  const cached = resultCache.get(cacheKey);
  if (!forceRefresh && cached && cached.expiresAt > Date.now()) return cached.result;

  const timeoutMs = options.timeoutMs ?? 15_000;
  const retryDelaysMs = options.retryDelaysMs ?? [0, 1_000, 3_000];
  let result: UpsellCompatibilityResult = {
    compatible: false,
    state: 'temporary_failure',
    reason: 'validation_not_started',
    attempts: 0,
    httpStatus: null,
  };

  let upsellId: string;
  try {
    upsellId = await resolveUpsellId(destinationUrl, timeoutMs, forceRefresh);
  } catch (error) {
    result = {
      ...result,
      reason: error instanceof Error ? error.message : 'destination_unreachable',
    };
    resultCache.set(cacheKey, { result, expiresAt: Date.now() + 30_000 });
    return result;
  }

  for (let index = 0; index < retryDelaysMs.length; index += 1) {
    await sleep(retryDelaysMs[index] ?? 0);
    try {
      const intentUrl = new URL('https://bff.vendepay.com/api/up-sell/intent');
      intentUrl.searchParams.set('upsellId', upsellId);
      intentUrl.searchParams.set('vendaId', vendaId);
      const response = await fetch(intentUrl, {
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: 'application/json', 'user-agent': 'TMX-Upsell-Validator/2.0' },
      });
      const body = await response.json().catch(() => null) as {
        error?: boolean;
        message?: string;
        data?: { vendaId?: string; upsellId?: string; vendaGeradaId?: string | null };
      } | null;
      const attempts = index + 1;
      const validIntent = response.ok && body?.error === false && Boolean(body.data);
      if (validIntent) {
        const alreadyConverted = Boolean(body?.data?.vendaGeradaId);
        result = {
          compatible: true,
          state: alreadyConverted ? 'already_converted' : 'recoverable',
          reason: alreadyConverted ? 'upsell_already_converted' : 'vendepay_intent_confirmed',
          attempts,
          httpStatus: response.status,
        };
        break;
      }
      const temporary = response.status === 408 || response.status === 429 || response.status >= 500;
      result = {
        compatible: false,
        state: temporary ? 'temporary_failure' : 'definitive_failure',
        reason: body?.message || `vendepay_http_${response.status}`,
        attempts,
        httpStatus: response.status,
      };
      if (!temporary) break;
    } catch (error) {
      result = {
        compatible: false,
        state: 'temporary_failure',
        reason: error instanceof Error ? error.message : 'vendepay_unreachable',
        attempts: index + 1,
        httpStatus: null,
      };
    }
  }

  const ttl = result.compatible ? 10 * 60_000 : result.state === 'temporary_failure' ? 30_000 : 5 * 60_000;
  resultCache.set(cacheKey, { result, expiresAt: Date.now() + ttl });
  return result;
}

export async function checkUpsellCompatibility(
  destinationUrl: string,
  vendaId: string,
  forceRefresh = false,
) {
  return (await checkUpsellCompatibilityDetailed(destinationUrl, vendaId, forceRefresh)).compatible;
}
