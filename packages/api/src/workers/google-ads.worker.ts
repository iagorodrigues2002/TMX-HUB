import { type NetworkParams, canonicalClickId } from '../lib/network-detection.js';

/**
 * Canonical Google click-conversion identifiers. The Google upload path can
 * pass this object directly as its click conversion match data.
 */
export function buildGoogleClickConversion(params: NetworkParams) {
  return canonicalClickId('google', params);
}
