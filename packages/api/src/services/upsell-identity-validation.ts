import type { UpsellCompatibilityResult } from './upsell-compatibility.js';

/** A buyer id is accepted only after the configured account's intent accepts it. */
export async function validateUpsellCandidates(
  candidates: string[],
  destinations: string[],
  check: (destination: string, candidate: string) => Promise<UpsellCompatibilityResult>,
): Promise<{ vendid?: string; temporary: boolean; reason: string }> {
  if (!destinations.length) return { temporary: true, reason: 'account_destination_not_configured' };
  if (!candidates.length) return { temporary: false, reason: 'buyer_sale_id_missing' };
  let temporary = false;
  let reason = 'vendepay_not_eligible';
  for (const candidate of candidates.slice(0, 5)) {
    for (const destination of destinations) {
      const result = await check(destination, candidate);
      if (result.compatible) return { vendid: candidate, temporary: false, reason: result.reason };
      temporary ||= result.state === 'temporary_failure';
      reason = result.reason;
    }
  }
  return { temporary, reason: temporary ? 'vendepay_temporarily_unavailable' : reason };
}
