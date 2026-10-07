import { normalizeExplodely, type ExplodelyNormalizationResult } from '../explodely/normalize.js';
import { normalizeVendepay, type VendepayNormalizeResult } from './normalize.js';

function asVendepayResult(result: ExplodelyNormalizationResult): VendepayNormalizeResult {
  if (result.kind === 'quarantined') return result;
  return {
    ...result,
    event: {
      ...result.event,
      vendid: undefined,
    },
  };
}

/**
 * Narrow compatibility bridge for the one historic VendePay URL that is used
 * by Explodely. The caller, not this adapter, decides whether a connection is
 * explicitly authorized for this fallback. All other VendePay connections
 * keep their canonical normalizer unchanged.
 */
export function normalizeVendepayWebhook(
  payload: unknown,
  allowExplodelyCompatibility: boolean,
): VendepayNormalizeResult {
  if (!allowExplodelyCompatibility) return normalizeVendepay(payload);
  const explodely = normalizeExplodely(payload, 'USD');
  return explodely.kind === 'processable'
    ? asVendepayResult(explodely)
    : normalizeVendepay(payload);
}
