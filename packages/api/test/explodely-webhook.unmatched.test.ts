import { describe, expect, it } from 'vitest';
import {
  explodelyConnectionMatches,
  normalizeExplodely,
} from '../src/integrations/explodely/normalize.js';

describe('Explodely unmatched vendor', () => {
  it('does not match a tenant when vendor and seller identifiers differ', () => {
    const normalized = normalizeExplodely(
      { type: 'sale', orderid: 'order-20', vendor_id: 'vendor-unknown' },
      Buffer.from('type=sale&orderid=order-20&vendor_id=vendor-unknown'),
    );
    expect(normalized.kind).toBe('processable');
    if (normalized.kind !== 'processable') return;
    expect(
      explodelyConnectionMatches(
        { vendor_id: 'vendor-configured', seller_id: 'seller-configured' },
        normalized.event,
      ),
    ).toBe(false);
  });
});
