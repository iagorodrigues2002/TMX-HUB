import { describe, expect, it } from 'vitest';
import { normalizeExplodely } from '../src/integrations/explodely/normalize.js';

describe('normalizeExplodely attribution keys', () => {
  it('preserves VTurb conversion keys and uses vtid as a tracking fallback', () => {
    const payload = {
      orderid: 'ex-1',
      type: 'sale',
      amount: '10',
      currency: 'EUR',
      vtid: 'v3_player_variant',
      sid: 'v3_session',
      subid: 'v3_subid',
      xcod: 'v3_xcod',
      sub20: 'v3_sub20',
    };
    const normalized = normalizeExplodely(payload, Buffer.from(JSON.stringify(payload)));

    expect(normalized.kind).toBe('processable');
    if (normalized.kind !== 'processable') return;
    expect(normalized.event.trackingId).toBe('v3_player_variant');
    expect(normalized.event.source).toMatchObject({
      src: 'v3_player_variant',
      vtid: 'v3_player_variant',
      sid: 'v3_session',
      subid: 'v3_subid',
      xcod: 'v3_xcod',
      sub20: 'v3_sub20',
    });
  });
});
