import { describe, expect, it } from 'vitest';
import {
  assertMetaCapiAccepted,
  metaCapiErrorDetail,
  metaEventsReceived,
} from '../src/integrations/meta/capi-response.js';

describe('Meta CAPI response validation', () => {
  it('only accepts a response that confirms at least one event', () => {
    expect(assertMetaCapiAccepted(200, { events_received: 1, fbtrace_id: 'trace' })).toBe(1);
    expect(metaEventsReceived({ events_received: '2' })).toBe(2);
  });

  it('rejects a 2xx response without event confirmation', () => {
    expect(() => assertMetaCapiAccepted(200, {})).toThrow('events_received=0');
    expect(() => assertMetaCapiAccepted(200, { events_received: 0 })).toThrow(
      'evento não foi confirmado',
    );
  });

  it('preserves the useful Graph error in the delivery failure', () => {
    const result = {
      error: {
        message: 'Invalid OAuth access token',
        code: 190,
        error_subcode: 463,
      },
    };
    expect(metaCapiErrorDetail(400, result)).toContain('code 190');
    expect(metaCapiErrorDetail(400, result)).toContain('Invalid OAuth access token');
    expect(() => assertMetaCapiAccepted(400, result)).toThrow('subcode 463');
  });
});
