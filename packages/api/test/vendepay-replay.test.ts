import { describe, expect, it } from 'vitest';
import {
  VENDEPAY_REPLAY_MAX_ATTEMPTS,
  vendepayReplayFailureTransition,
  vendepayReplaySucceeded,
} from '../src/services/vendepay-replay.js';

describe('VendePay quarantine replay', () => {
  it('moves to a definitive failed state on the fifth failed replay', () => {
    expect(vendepayReplayFailureTransition(VENDEPAY_REPLAY_MAX_ATTEMPTS - 2)).toEqual({
      attempts: 4,
      replayState: 'quarantined',
      terminal: false,
    });
    expect(vendepayReplayFailureTransition(VENDEPAY_REPLAY_MAX_ATTEMPTS - 1)).toEqual({
      attempts: 5,
      replayState: 'replay_failed',
      terminal: true,
    });
  });

  it('does not count an idempotent duplicate as a successful replay', () => {
    expect(vendepayReplaySucceeded(200, { accepted: true, duplicate: true })).toBe(false);
    expect(vendepayReplaySucceeded(200, { accepted: true })).toBe(true);
    expect(vendepayReplaySucceeded(503, { accepted: false })).toBe(false);
  });
});
