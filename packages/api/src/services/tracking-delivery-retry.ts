export const TRACKING_DELIVERY_MAX_ATTEMPTS = 8;

export function trackingDeliveryFailureState(attempts: number): 'failed' | 'dead' {
  return attempts >= TRACKING_DELIVERY_MAX_ATTEMPTS ? 'dead' : 'failed';
}
