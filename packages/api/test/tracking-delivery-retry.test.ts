import { describe, expect, it } from 'vitest';
import {
  TRACKING_DELIVERY_MAX_ATTEMPTS,
  trackingDeliveryFailureState,
} from '../src/services/tracking-delivery-retry.js';

describe('tracking delivery retries', () => {
  it('keeps a failed delivery retryable before the attempt limit', () => {
    expect(trackingDeliveryFailureState(TRACKING_DELIVERY_MAX_ATTEMPTS - 1)).toBe('failed');
  });

  it('marks the delivery dead when the current attempt reaches the limit', () => {
    expect(trackingDeliveryFailureState(TRACKING_DELIVERY_MAX_ATTEMPTS)).toBe('dead');
  });
});
