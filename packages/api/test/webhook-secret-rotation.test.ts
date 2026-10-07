import { describe, expect, it } from 'vitest';
import { createTrackingToken, readTrackingTokenWithRotation } from '../src/lib/tracking-token.js';

describe('webhook secret rotation', () => {
  it('accepts the previous tracking secret during a rotation window', () => {
    const currentSecret = 'current-secret-long-enough-for-the-test';
    const previousSecret = 'previous-secret-long-enough-for-the-test';
    const token = createTrackingToken(
      { projectId: 'project-1', visitorId: 'visitor-1', journeyId: 'journey-1' },
      previousSecret,
    );

    expect(readTrackingTokenWithRotation(token, currentSecret, previousSecret)).toMatchObject({
      matched: 'previous',
      payload: { projectId: 'project-1', visitorId: 'visitor-1', journeyId: 'journey-1' },
    });
    expect(readTrackingTokenWithRotation(token, currentSecret)).toBeNull();
  });
});
